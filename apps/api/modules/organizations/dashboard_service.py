import math
from datetime import datetime, timezone
from typing import Optional
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.core.exceptions import AppException
from apps.api.modules.audit.models import AuditEvent
from apps.api.modules.evaluations.models import (
    EvaluationJob,
    EvaluationResult,
    JudgeReview,
    Submission,
    Team,
    TeamMember,
)
from apps.api.modules.hackathons.models import Hackathon, HackathonStatus
from apps.api.modules.organizations.dashboard_schemas import (
    OrganizationActivityItem,
    OrganizationActivityResponse,
    OrganizationDashboardHackathon,
    OrganizationDashboardResponse,
    OrganizationTeamDetailResponse,
    OrganizationTeamListItem,
    OrganizationTeamMember,
    UpdateOrganizationSettingsRequest,
)
from apps.api.modules.organizations.models import OrgRole, Organization
from apps.api.modules.users.models import User


async def get_organization_dashboard(
    db: AsyncSession, org: Organization, role: OrgRole
) -> OrganizationDashboardResponse:
    now = datetime.now(timezone.utc)
    team_count = (
        select(func.count(Team.id))
        .where(Team.hackathon_id == Hackathon.id, Team.organization_id == org.id)
        .scalar_subquery()
    )
    submission_count = (
        select(func.count(Submission.id))
        .where(
            Submission.hackathon_id == Hackathon.id,
            Submission.organization_id == org.id,
            Submission.deleted_at.is_(None),
        )
        .scalar_subquery()
    )
    evaluation_completed = (
        select(func.count(EvaluationJob.id))
        .where(
            EvaluationJob.hackathon_id == Hackathon.id,
            EvaluationJob.organization_id == org.id,
            EvaluationJob.status == "completed",
        )
        .scalar_subquery()
    )
    evaluation_total = (
        select(func.count(EvaluationJob.id))
        .where(
            EvaluationJob.hackathon_id == Hackathon.id,
            EvaluationJob.organization_id == org.id,
        )
        .scalar_subquery()
    )
    evaluation_pending = (
        select(func.count(EvaluationJob.id))
        .where(
            EvaluationJob.hackathon_id == Hackathon.id,
            EvaluationJob.organization_id == org.id,
            EvaluationJob.status == "queued",
        )
        .scalar_subquery()
    )
    evaluation_running = (
        select(func.count(EvaluationJob.id))
        .where(
            EvaluationJob.hackathon_id == Hackathon.id,
            EvaluationJob.organization_id == org.id,
            EvaluationJob.status == "running",
        )
        .scalar_subquery()
    )
    hackathon_rows = (
        await db.execute(
            select(
                Hackathon,
                User.full_name,
                team_count.label("team_count"),
                submission_count.label("submission_count"),
                evaluation_total.label("evaluation_total"),
                evaluation_completed.label("evaluation_completed"),
                evaluation_pending.label("evaluation_pending"),
                evaluation_running.label("evaluation_running"),
            )
            .outerjoin(User, User.id == Hackathon.created_by_user_id)
            .where(
                Hackathon.organization_id == org.id,
                Hackathon.deleted_at.is_(None),
            )
            .order_by(Hackathon.created_at.desc())
        )
    ).all()

    teams_total = sum(int(row.team_count or 0) for row in hackathon_rows)
    submissions_total = sum(int(row.submission_count or 0) for row in hackathon_rows)
    evaluations_completed_total = sum(
        int(row.evaluation_completed or 0) for row in hackathon_rows
    )
    evaluations_pending_total = sum(
        int(row.evaluation_pending or 0) for row in hackathon_rows
    )
    evaluations_running_total = sum(
        int(row.evaluation_running or 0) for row in hackathon_rows
    )

    submission_teams = (
        await db.execute(
            select(func.count(func.distinct(Submission.team_id))).where(
                Submission.organization_id == org.id,
                Submission.deleted_at.is_(None),
            )
        )
    ).scalar_one()
    pending_submissions = (
        await db.execute(
            select(func.count(Submission.id)).where(
                Submission.organization_id == org.id,
                Submission.deleted_at.is_(None),
                Submission.status == "pending",
            )
        )
    ).scalar_one()

    owner = (
        await db.execute(select(User).where(User.id == org.owner_id))
    ).scalar_one_or_none()

    hackathons = []
    for row in hackathon_rows:
        event = row.Hackathon
        status_value = (
            event.status.value
            if isinstance(event.status, HackathonStatus)
            else str(event.status)
        )
        settings = event.settings or {}
        hackathons.append(
            OrganizationDashboardHackathon(
                id=event.id,
                title=event.title,
                status=status_value,
                start_date=event.start_date,
                end_date=event.end_date,
                organizer_name=row.full_name,
                team_count=int(row.team_count or 0),
                submission_count=int(row.submission_count or 0),
                evaluation_total=int(row.evaluation_total or 0),
                evaluation_completed=int(row.evaluation_completed or 0),
                evaluation_pending=int(row.evaluation_pending or 0),
                evaluation_in_progress=int(row.evaluation_running or 0),
                results_finalized=bool(settings.get("results_published"))
                or status_value == HackathonStatus.COMPLETED.value,
            )
        )

    total_hackathons = len(hackathon_rows)
    return OrganizationDashboardResponse(
        id=org.id,
        name=org.name,
        slug=org.slug,
        status=org.status,
        owner_id=org.owner_id,
        owner_name=owner.full_name if owner else None,
        owner_email=owner.email if owner else None,
        current_user_role=role,
        created_at=org.created_at,
        settings={
            key: (org.settings or {})[key]
            for key in ("timezone", "max_hackathons")
            if key in (org.settings or {})
        },
        total_hackathons=total_hackathons,
        active_hackathons=sum(
            event.status == HackathonStatus.PUBLISHED
            and event.start_date <= now <= event.end_date
            for event, *_ in hackathon_rows
        ),
        upcoming_hackathons=sum(
            event.status == HackathonStatus.PUBLISHED and event.start_date > now
            for event, *_ in hackathon_rows
        ),
        completed_hackathons=sum(
            event.status == HackathonStatus.COMPLETED
            for event, *_ in hackathon_rows
        ),
        total_teams=teams_total,
        teams_with_submissions=int(submission_teams or 0),
        total_submissions=submissions_total,
        pending_submissions=int(pending_submissions or 0),
        evaluations_completed=evaluations_completed_total,
        evaluations_pending=evaluations_pending_total,
        evaluations_in_progress=evaluations_running_total,
        finalized_results=sum(item.results_finalized for item in hackathons),
        hackathons=hackathons,
    )


def _evaluation_label(status: Optional[str], has_submission: bool) -> str:
    if not has_submission:
        return "not_started"
    if status == "completed":
        return "completed"
    if status == "running":
        return "in_progress"
    if status == "queued":
        return "pending"
    if status == "failed":
        return "failed"
    return "not_started"


async def list_organization_teams(
    db: AsyncSession,
    org_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    hackathon_id: Optional[uuid.UUID] = None,
    submission_status: Optional[str] = None,
    evaluation_status: Optional[str] = None,
    sort_by: str = "registered_at",
    sort_order: str = "desc",
):
    latest_submissions = (
        select(
            Submission,
            func.row_number()
            .over(
                partition_by=Submission.team_id,
                order_by=Submission.created_at.desc(),
            )
            .label("row_number"),
        )
        .where(
            Submission.organization_id == org_id,
            Submission.deleted_at.is_(None),
        )
        .subquery()
    )
    latest_submission = aliased(Submission, latest_submissions)
    latest_jobs = (
        select(
            EvaluationJob.submission_id,
            EvaluationJob.status,
            func.row_number()
            .over(
                partition_by=EvaluationJob.submission_id,
                order_by=EvaluationJob.created_at.desc(),
            )
            .label("row_number"),
        )
        .where(EvaluationJob.organization_id == org_id)
        .subquery()
    )
    member_counts = (
        select(
            TeamMember.team_id,
            func.count(TeamMember.id).label("member_count"),
        )
        .group_by(TeamMember.team_id)
        .subquery()
    )
    query = (
        select(
            Team,
            Hackathon.title.label("hackathon_name"),
            User.full_name.label("leader_name"),
            User.email.label("leader_email"),
            func.coalesce(member_counts.c.member_count, 0).label("member_count"),
            latest_submission,
            latest_jobs.c.status.label("evaluation_status"),
        )
        .join(
            Hackathon,
            (Hackathon.id == Team.hackathon_id)
            & (Hackathon.organization_id == org_id)
            & (Hackathon.deleted_at.is_(None)),
        )
        .outerjoin(
            TeamMember,
            (TeamMember.team_id == Team.id)
            & (TeamMember.role_in_team == "leader"),
        )
        .outerjoin(User, User.id == TeamMember.user_id)
        .outerjoin(
            latest_submission,
            (latest_submission.team_id == Team.id)
            & (latest_submissions.c.row_number == 1),
        )
        .outerjoin(
            latest_jobs,
            (latest_jobs.c.submission_id == latest_submission.id)
            & (latest_jobs.c.row_number == 1),
        )
        .outerjoin(member_counts, member_counts.c.team_id == Team.id)
        .where(Team.organization_id == org_id)
    )
    filters = []
    if search and search.strip():
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                Team.name.ilike(term),
                cast(Team.id, String).ilike(term),
                Hackathon.title.ilike(term),
            )
        )
    if hackathon_id:
        filters.append(Team.hackathon_id == hackathon_id)
    if submission_status == "submitted":
        filters.append(latest_submission.id.is_not(None))
    elif submission_status == "no_submission":
        filters.append(latest_submission.id.is_(None))
    elif submission_status in {"pending", "evaluated", "flagged", "withdrawn"}:
        filters.append(latest_submission.status == submission_status)

    if evaluation_status == "completed":
        filters.append(latest_jobs.c.status == "completed")
    elif evaluation_status == "pending":
        filters.append(latest_jobs.c.status == "queued")
    elif evaluation_status == "in_progress":
        filters.append(latest_jobs.c.status == "running")
    elif evaluation_status == "failed":
        filters.append(latest_jobs.c.status == "failed")
    elif evaluation_status == "not_started":
        filters.append(
            or_(latest_submission.id.is_(None), latest_jobs.c.status.is_(None))
        )

    filtered_query = query.where(*filters)
    total = (
        await db.execute(
            filtered_query.with_only_columns(
                func.count(func.distinct(Team.id)),
                maintain_column_froms=True,
            ).order_by(None)
        )
    ).scalar_one()

    sort_columns = {
        "name": Team.name,
        "hackathon": Hackathon.title,
        "registered_at": Team.created_at,
        "member_count": member_counts.c.member_count,
    }
    sort_column = sort_columns.get(sort_by, Team.created_at)
    ordered = (
        sort_column.desc()
        if sort_order.lower() == "desc"
        else sort_column.asc()
    )
    rows = (
        await db.execute(
            filtered_query.order_by(ordered, Team.id)
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()
    items = [
        OrganizationTeamListItem(
            id=team.id,
            name=team.name,
            team_number=str(team.id),
            hackathon_id=team.hackathon_id,
            hackathon_name=hackathon_name,
            leader_name=leader_name,
            leader_email=leader_email,
            member_count=int(member_count or 0),
            registered_at=team.created_at,
            submission_id=submission.id if submission else None,
            submission_title=submission.title if submission else None,
            submission_description=submission.description if submission else None,
            repository_url=submission.repository_url if submission else None,
            submission_status=submission.status if submission else "not_submitted",
            evaluation_status=_evaluation_label(
                evaluation_status, submission is not None
            ),
        )
        for (
            team,
            hackathon_name,
            leader_name,
            leader_email,
            member_count,
            submission,
            evaluation_status,
        ) in rows
    ]
    return items, int(total or 0), math.ceil(total / limit) if total else 0


async def get_organization_team(
    db: AsyncSession, org_id: uuid.UUID, team_id: uuid.UUID
) -> OrganizationTeamDetailResponse:
    team = (
        await db.execute(
            select(Team, Hackathon.title)
            .join(
                Hackathon,
                (Hackathon.id == Team.hackathon_id)
                & (Hackathon.organization_id == org_id)
                & (Hackathon.deleted_at.is_(None)),
            )
            .where(Team.id == team_id, Team.organization_id == org_id)
        )
    ).first()
    if not team:
        raise AppException(
            code="TEAM_NOT_FOUND",
            message="Team not found in this organization.",
            status_code=404,
            title="Team Not Found",
        )

    record, hackathon_name = team
    members = (
        await db.execute(
            select(TeamMember, User)
            .join(User, User.id == TeamMember.user_id)
            .where(TeamMember.team_id == record.id)
            .order_by(TeamMember.role_in_team.desc(), TeamMember.joined_at.asc())
        )
    ).all()
    submission = (
        await db.execute(
            select(Submission)
            .where(
                Submission.team_id == record.id,
                Submission.organization_id == org_id,
                Submission.deleted_at.is_(None),
            )
            .order_by(Submission.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    evaluation = None
    if submission:
        evaluation = (
            await db.execute(
                select(EvaluationJob.status)
                .where(
                    EvaluationJob.submission_id == submission.id,
                    EvaluationJob.organization_id == org_id,
                )
                .order_by(EvaluationJob.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
    return OrganizationTeamDetailResponse(
        id=record.id,
        name=record.name,
        team_number=str(record.id),
        hackathon_id=record.hackathon_id,
        hackathon_name=hackathon_name,
        created_at=record.created_at,
        members=[
            OrganizationTeamMember(
                id=member.id,
                name=user.full_name,
                email=user.email,
                role=member.role_in_team,
                joined_at=member.joined_at,
            )
            for member, user in members
        ],
        submission_id=submission.id if submission else None,
        submission_title=submission.title if submission else None,
        submission_description=submission.description if submission else None,
        repository_url=submission.repository_url if submission else None,
        submission_status=submission.status if submission else "not_submitted",
        evaluation_status=_evaluation_label(evaluation, submission is not None),
    )


async def list_organization_activity(
    db: AsyncSession,
    org_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    activity_type: Optional[str] = None,
    actor: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    hackathon_id: Optional[uuid.UUID] = None,
) -> OrganizationActivityResponse:
    query = select(AuditEvent).where(AuditEvent.organization_id == org_id)
    if activity_type:
        query = query.where(AuditEvent.action == activity_type)
    if actor and actor.strip():
        query = query.where(AuditEvent.actor_email.ilike(f"%{actor.strip()}%"))
    if start_date:
        query = query.where(AuditEvent.timestamp >= start_date)
    if end_date:
        query = query.where(AuditEvent.timestamp <= end_date)
    if hackathon_id:
        related_resource_ids = select(cast(Hackathon.id, String)).where(
            Hackathon.organization_id == org_id,
            Hackathon.deleted_at.is_(None),
            Hackathon.id == hackathon_id,
        ).union(
            select(cast(Team.id, String)).where(
                Team.organization_id == org_id, Team.hackathon_id == hackathon_id
            ),
            select(cast(Submission.id, String)).where(
                Submission.organization_id == org_id,
                Submission.hackathon_id == hackathon_id,
            ),
            select(cast(EvaluationJob.id, String)).where(
                EvaluationJob.organization_id == org_id,
                EvaluationJob.hackathon_id == hackathon_id,
            ),
            select(cast(EvaluationResult.id, String)).where(
                EvaluationResult.organization_id == org_id,
                EvaluationResult.hackathon_id == hackathon_id,
            ),
            select(cast(JudgeReview.id, String)).where(
                JudgeReview.organization_id == org_id,
                JudgeReview.hackathon_id == hackathon_id,
            ),
        )
        query = query.where(AuditEvent.resource_id.in_(related_resource_ids))

    total = (
        await db.execute(select(func.count()).select_from(query.subquery()))
    ).scalar_one()
    events = (
        await db.execute(
            query.order_by(AuditEvent.timestamp.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()
    names_by_resource_id: dict[str, str] = {}
    resource_groups = {
        kind: [event.resource_id for event in events if event.resource_type == kind]
        for kind in (
            "hackathon",
            "team",
            "submission",
            "evaluation_job",
            "evaluation_result",
            "judge_review",
        )
    }
    if resource_groups["hackathon"]:
        names_by_resource_id.update(
            (
                await db.execute(
                    select(cast(Hackathon.id, String), Hackathon.title).where(
                        Hackathon.organization_id == org_id,
                        cast(Hackathon.id, String).in_(resource_groups["hackathon"]),
                    )
                )
            ).all()
        )
    for resource_type, model in (
        ("team", Team),
        ("submission", Submission),
        ("evaluation_job", EvaluationJob),
        ("evaluation_result", EvaluationResult),
        ("judge_review", JudgeReview),
    ):
        resource_ids = resource_groups[resource_type]
        if not resource_ids:
            continue
        names_by_resource_id.update(
            (
                await db.execute(
                    select(cast(model.id, String), Hackathon.title)
                    .join(
                        Hackathon,
                        (Hackathon.id == model.hackathon_id)
                        & (Hackathon.organization_id == org_id),
                    )
                    .where(
                        model.organization_id == org_id,
                        cast(model.id, String).in_(resource_ids),
                    )
                )
            ).all()
        )

    items = [
        OrganizationActivityItem(
            id=event.id,
            actor=event.actor_email,
            actor_role=event.actor_role,
            action=event.action,
            related_entity=event.resource_type,
            related_entity_id=event.resource_id,
            hackathon_name=names_by_resource_id.get(event.resource_id),
            timestamp=event.timestamp,
            description=event.action.replace("_", " ").capitalize(),
        )
        for event in events
    ]
    return OrganizationActivityResponse(
        items=items,
        total=int(total or 0),
        page=page,
        limit=limit,
        total_pages=math.ceil(total / limit) if total else 0,
    )

async def update_organization_settings(
    db: AsyncSession,
    org: Organization,
    role: OrgRole,
    actor: User,
    payload: UpdateOrganizationSettingsRequest,
    ip_address: str,
    user_agent: str,
    correlation_id: Optional[uuid.UUID],
) -> Organization:
    if payload.max_hackathons is not None:
        await validate_organization_settings(
            db,
            org.id,
            role,
            {"max_hackathons": payload.max_hackathons},
        )

    old_settings = dict(org.settings or {})
    new_settings = dict(old_settings)
    if payload.timezone is not None:
        new_settings["timezone"] = payload.timezone
    if payload.max_hackathons is not None:
        new_settings["max_hackathons"] = payload.max_hackathons
    org.settings = new_settings

    from apps.api.modules.audit.models import AuditOutcome
    from apps.api.modules.audit.service import record_audit_event

    diff = {
        key: {"old": old_settings.get(key), "new": new_settings.get(key)}
        for key in ("timezone", "max_hackathons")
        if old_settings.get(key) != new_settings.get(key)
    }
    if diff:
        await record_audit_event(
            db=db,
            action="org_settings_updated",
            resource_type="organization",
            resource_id=str(org.id),
            outcome=AuditOutcome.SUCCESS,
            actor_user_id=actor.id,
            actor_email=actor.email,
            actor_role=role.value,
            organization_id=org.id,
            reason="Organization settings updated",
            diff_payload=diff,
            ip_address=ip_address,
            user_agent=user_agent,
            correlation_id=correlation_id,
        )
        await db.commit()
        await db.refresh(org)
    return org


async def validate_organization_settings(
    db: AsyncSession,
    org_id: uuid.UUID,
    role: OrgRole,
    values: dict,
) -> None:
    if "timezone" in values:
        timezone_value = values["timezone"]
        if not isinstance(timezone_value, str):
            raise AppException(
                code="INVALID_ORGANIZATION_TIMEZONE",
                message="Timezone must be a valid IANA timezone.",
                status_code=422,
                title="Invalid Timezone",
            )
        try:
            ZoneInfo(timezone_value)
        except ZoneInfoNotFoundError as exc:
            raise AppException(
                code="INVALID_ORGANIZATION_TIMEZONE",
                message="Timezone must be a valid IANA timezone.",
                status_code=422,
                title="Invalid Timezone",
            ) from exc

    if "max_hackathons" not in values:
        return
    max_hackathons = values["max_hackathons"]
    if role != OrgRole.ORG_OWNER:
        raise AppException(
            code="FORBIDDEN_INSUFFICIENT_ORG_ROLE",
            message="Only the organization owner can change the hackathon quota.",
            status_code=403,
            title="Insufficient Permissions",
        )
    if type(max_hackathons) is not int or not 1 <= max_hackathons <= 10000:
        raise AppException(
            code="INVALID_HACKATHON_QUOTA",
            message="Maximum hackathons must be a whole number from 1 to 10000.",
            status_code=422,
            title="Invalid Hackathon Limit",
        )

    active_count = (
        await db.execute(
            select(func.count(Hackathon.id)).where(
                Hackathon.organization_id == org_id,
                Hackathon.deleted_at.is_(None),
                Hackathon.status != HackathonStatus.ARCHIVED,
            )
        )
    ).scalar_one()
    if max_hackathons < active_count:
        raise AppException(
            code="HACKATHON_QUOTA_BELOW_USAGE",
            message="The hackathon limit cannot be lower than the number of non-archived hackathons.",
            status_code=422,
            title="Invalid Hackathon Limit",
        )
