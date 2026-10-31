from datetime import datetime, timedelta, timezone
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from apps.api.config import settings
from apps.api.modules.audit.models import AuditEvent, AuditOutcome
from apps.api.modules.evaluations.models import Team, TeamMember
from apps.api.modules.hackathons.models import Hackathon, HackathonStatus
from apps.api.modules.organizations.models import (
    MembershipStatus,
    OrgRole,
    Organization,
    OrganizationMembership,
    OrganizationStatus,
)
from apps.api.modules.users.models import PlatformRole, User

ORIGIN_HEADER = {"Origin": "http://testserver"}


@pytest.fixture
async def hackathon_test_setup(db_session, create_user_helper, create_session_helper):
    """
    Sets up a complete test fixture with two distinct organizations:
    Org A: Owned by Alice (Owner), Bob (Admin), Charlie (Organizer), Dave (Organizer)
    Org B: Owned by Frank (Owner)
    Platform Administrators: Platform Owner & Platform Ops Admin
    """
    suffix = uuid.uuid4().hex[:6]

    # Platform Admins
    platform_owner = await create_user_helper(
        email=f"p_owner_{suffix}@scorva.io",
        platform_role=PlatformRole.PLATFORM_OWNER,
    )
    p_owner_token = await create_session_helper(platform_owner)

    platform_ops = await create_user_helper(
        email=f"p_ops_{suffix}@scorva.io",
        platform_role=PlatformRole.PLATFORM_OPS_ADMIN,
    )
    p_ops_token = await create_session_helper(platform_ops)

    sec_admin = await create_user_helper(
        email=f"sec_admin_{suffix}@scorva.io",
        platform_role=PlatformRole.SECURITY_ADMIN,
    )
    sec_admin_token = await create_session_helper(sec_admin)

    # Org A Users
    alice = await create_user_helper(email=f"alice_{suffix}@alpha.io", platform_role=None)
    alice_token = await create_session_helper(alice)

    bob = await create_user_helper(email=f"bob_{suffix}@alpha.io", platform_role=None)
    bob_token = await create_session_helper(bob)

    charlie = await create_user_helper(email=f"charlie_{suffix}@alpha.io", platform_role=None)
    charlie_token = await create_session_helper(charlie)

    dave = await create_user_helper(email=f"dave_{suffix}@alpha.io", platform_role=None)
    dave_token = await create_session_helper(dave)

    # Org B Users
    frank = await create_user_helper(email=f"frank_{suffix}@beta.io", platform_role=None)
    frank_token = await create_session_helper(frank)

    # Organizations
    org_a = Organization(
        id=uuid.uuid4(),
        name=f"Alpha Corp {suffix}",
        slug=f"alpha-corp-{suffix}",
        owner_id=alice.id,
        status=OrganizationStatus.ACTIVE,
        settings={"max_hackathons": 5, "timezone": "UTC"},
    )
    org_b = Organization(
        id=uuid.uuid4(),
        name=f"Beta Labs {suffix}",
        slug=f"beta-labs-{suffix}",
        owner_id=frank.id,
        status=OrganizationStatus.ACTIVE,
        settings={"max_hackathons": 5, "timezone": "America/New_York"},
    )
    db_session.add_all([org_a, org_b])

    # Memberships
    m_alice = OrganizationMembership(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        user_id=alice.id,
        role=OrgRole.ORG_OWNER,
        status=MembershipStatus.ACTIVE,
    )
    m_bob = OrganizationMembership(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        user_id=bob.id,
        role=OrgRole.ORG_ADMIN,
        status=MembershipStatus.ACTIVE,
    )
    m_charlie = OrganizationMembership(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        user_id=charlie.id,
        role=OrgRole.ORGANIZER,
        status=MembershipStatus.ACTIVE,
    )
    m_dave = OrganizationMembership(
        id=uuid.uuid4(),
        organization_id=org_a.id,
        user_id=dave.id,
        role=OrgRole.ORGANIZER,
        status=MembershipStatus.ACTIVE,
    )
    m_frank = OrganizationMembership(
        id=uuid.uuid4(),
        organization_id=org_b.id,
        user_id=frank.id,
        role=OrgRole.ORG_OWNER,
        status=MembershipStatus.ACTIVE,
    )
    db_session.add_all([m_alice, m_bob, m_charlie, m_dave, m_frank])
    await db_session.commit()

    return {
        "suffix": suffix,
        "platform_owner": platform_owner,
        "p_owner_token": p_owner_token,
        "platform_ops": platform_ops,
        "p_ops_token": p_ops_token,
        "sec_admin": sec_admin,
        "sec_admin_token": sec_admin_token,
        "alice": alice,
        "alice_token": alice_token,
        "bob": bob,
        "bob_token": bob_token,
        "charlie": charlie,
        "charlie_token": charlie_token,
        "dave": dave,
        "dave_token": dave_token,
        "frank": frank,
        "frank_token": frank_token,
        "org_a": org_a,
        "org_b": org_b,
    }


@pytest.mark.asyncio
async def test_organization_dashboard_and_teams_are_tenant_scoped(
    client: AsyncClient, db_session, hackathon_test_setup
):
    s = hackathon_test_setup
    now = datetime.now(timezone.utc)
    hackathon_a = Hackathon(
        id=uuid.uuid4(),
        organization_id=s["org_a"].id,
        title="Alpha Event",
        slug=f"alpha-event-{s['suffix']}",
        status=HackathonStatus.PUBLISHED,
        start_date=now + timedelta(days=1),
        submission_deadline=now + timedelta(days=2),
        end_date=now + timedelta(days=3),
        created_by_user_id=s["alice"].id,
        settings={},
    )
    hackathon_b = Hackathon(
        id=uuid.uuid4(),
        organization_id=s["org_b"].id,
        title="Beta Event",
        slug=f"beta-event-{s['suffix']}",
        status=HackathonStatus.PUBLISHED,
        start_date=now + timedelta(days=1),
        submission_deadline=now + timedelta(days=2),
        end_date=now + timedelta(days=3),
        created_by_user_id=s["frank"].id,
        settings={},
    )
    team_a = Team(
        id=uuid.uuid4(),
        organization_id=s["org_a"].id,
        hackathon_id=hackathon_a.id,
        name="Alpha Team",
        join_code=f"alpha-{s['suffix']}",
        created_by_user_id=s["alice"].id,
    )
    team_b = Team(
        id=uuid.uuid4(),
        organization_id=s["org_b"].id,
        hackathon_id=hackathon_b.id,
        name="Beta Team",
        join_code=f"beta-{s['suffix']}",
        created_by_user_id=s["frank"].id,
    )
    db_session.add_all([hackathon_a, hackathon_b])
    await db_session.flush()
    db_session.add_all([team_a, team_b])
    await db_session.flush()
    db_session.add_all([
        TeamMember(team_id=team_a.id, user_id=s["alice"].id, role_in_team="leader"),
        TeamMember(team_id=team_b.id, user_id=s["frank"].id, role_in_team="leader"),
    ])
    await db_session.commit()

    dashboard = await client.get(
        f"/api/v1/organizations/{s['org_a'].id}/dashboard",
        cookies={settings.SESSION_COOKIE_NAME: s["alice_token"]},
    )
    assert dashboard.status_code == 200
    body = dashboard.json()
    assert body["total_hackathons"] == 1
    assert body["total_teams"] == 1
    assert [event["title"] for event in body["hackathons"]] == ["Alpha Event"]

    team_page = await client.get(
        f"/api/v1/organizations/{s['org_a'].id}/teams",
        cookies={settings.SESSION_COOKIE_NAME: s["alice_token"]},
    )
    assert team_page.status_code == 200
    assert team_page.json()["total"] == 1
    assert [team["name"] for team in team_page.json()["items"]] == ["Alpha Team"]

    team_detail = await client.get(
        f"/api/v1/organizations/{s['org_a'].id}/teams/{team_a.id}",
        cookies={settings.SESSION_COOKIE_NAME: s["alice_token"]},
    )
    assert team_detail.status_code == 200
    assert team_detail.json()["hackathon_name"] == "Alpha Event"
    assert team_detail.json()["members"][0]["email"] == s["alice"].email

    cross_tenant_team = await client.get(
        f"/api/v1/organizations/{s['org_a'].id}/teams/{team_b.id}",
        cookies={settings.SESSION_COOKIE_NAME: s["alice_token"]},
    )
    assert cross_tenant_team.status_code == 404

    cross_tenant_dashboard = await client.get(
        f"/api/v1/organizations/{s['org_a'].id}/dashboard",
        cookies={settings.SESSION_COOKIE_NAME: s["frank_token"]},
    )
    assert cross_tenant_dashboard.status_code == 403


@pytest.mark.asyncio
async def test_organization_settings_validate_authorization_and_audit(
    client: AsyncClient, db_session, hackathon_test_setup
):
    s = hackathon_test_setup
    url = f"/api/v1/organizations/{s['org_a'].id}/settings"
    invalid = await client.patch(
        url,
        json={"timezone": "Not/A_Real_Zone"},
        cookies={settings.SESSION_COOKIE_NAME: s["alice_token"]},
        headers=ORIGIN_HEADER,
    )
    assert invalid.status_code == 422

    forbidden_quota = await client.patch(
        url,
        json={"max_hackathons": 9},
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    assert forbidden_quota.status_code == 403
    legacy_route_quota = await client.patch(
        f"/api/v1/organizations/{s['org_a'].id}",
        json={"settings": {"max_hackathons": 9}},
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    assert legacy_route_quota.status_code == 403

    updated = await client.patch(
        url,
        json={"timezone": "Europe/London", "max_hackathons": 9},
        cookies={settings.SESSION_COOKIE_NAME: s["alice_token"]},
        headers=ORIGIN_HEADER,
    )
    assert updated.status_code == 200
    assert updated.json()["settings"] == {
        "timezone": "Europe/London",
        "max_hackathons": 9,
    }

    audit = await db_session.execute(
        select(AuditEvent).where(
            AuditEvent.organization_id == s["org_a"].id,
            AuditEvent.action == "org_settings_updated",
        )
    )
    assert audit.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_organization_activity_does_not_expose_sensitive_audit_metadata(
    client: AsyncClient, db_session, hackathon_test_setup
):
    s = hackathon_test_setup
    event = AuditEvent(
        id=uuid.uuid4(),
        actor_user_id=s["alice"].id,
        actor_email=s["alice"].email,
        actor_role="org_owner",
        action="org_profile_updated",
        resource_type="organization",
        resource_id=str(s["org_a"].id),
        organization_id=s["org_a"].id,
        outcome=AuditOutcome.SUCCESS,
        reason="Organization profile updated",
        diff_payload={"private_repository": "https://github.com/private/project"},
        ip_address="192.0.2.1",
        user_agent="private browser metadata",
        correlation_id=uuid.uuid4(),
    )
    db_session.add(event)
    await db_session.commit()

    response = await client.get(
        f"/api/v1/organizations/{s['org_a'].id}/activity",
        cookies={settings.SESSION_COOKIE_NAME: s["alice_token"]},
    )
    assert response.status_code == 200
    serialized = response.text
    assert "private_repository" not in serialized
    assert "ip_address" not in serialized
    assert "user_agent" not in serialized
    assert "private browser metadata" not in serialized


# =====================================================================
# Group 4: Hackathon Lifecycle & Validation Tests (HACK-01..09)
# =====================================================================

@pytest.mark.asyncio
async def test_hack_01_create_draft_hackathon(client: AsyncClient, db_session, hackathon_test_setup):
    """
    HACK-01: Create Draft Hackathon.
    Role: OrgRole.ORGANIZER (Charlie).
    POST /api/v1/organizations/{org_id}/hackathons with valid dates and title.
    Expected: 201 Created. Initial status 'draft', created_by_user_id set to actor.
    Audit event 'hackathon_created' recorded with organization_id.
    """
    s = hackathon_test_setup
    now = datetime.now(timezone.utc)
    slug = f"ai-hackathon-{s['suffix']}"

    payload = {
        "title": "Global AI Challenge",
        "slug": slug,
        "description": "An open hackathon for agentic AI applications.",
        "start_date": (now + timedelta(days=2)).isoformat(),
        "submission_deadline": (now + timedelta(days=7)).isoformat(),
        "end_date": (now + timedelta(days=10)).isoformat(),
        "settings": {"max_team_size": 4, "track": "Enterprise"},
    }

    res = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons",
        json=payload,
        cookies={settings.SESSION_COOKIE_NAME: s["charlie_token"]},
        headers=ORIGIN_HEADER,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "Global AI Challenge"
    assert data["slug"] == slug
    assert data["status"] == "draft"
    assert data["created_by_user_id"] == str(s["charlie"].id)
    assert data["organization_id"] == str(s["org_a"].id)
    hackathon_id = uuid.UUID(data["id"])

    # Verify audit event
    audit_stmt = select(AuditEvent).where(
        AuditEvent.resource_id == str(hackathon_id),
        AuditEvent.action == "hackathon_created",
    )
    audit = (await db_session.execute(audit_stmt)).scalar_one_or_none()
    assert audit is not None
    assert audit.organization_id == s["org_a"].id
    assert audit.actor_user_id == s["charlie"].id


@pytest.mark.asyncio
async def test_hack_02_reject_invalid_timeline_dates(client: AsyncClient, hackathon_test_setup):
    """
    HACK-02: Reject Invalid Timeline Dates.
    Create hackathon where start_date > submission_deadline or submission_deadline > end_date.
    Expected: 422 Unprocessable Content (INVALID_TIMELINE_DATES).
    """
    s = hackathon_test_setup
    now = datetime.now(timezone.utc)

    # Case 1: start_date > submission_deadline
    bad_payload_1 = {
        "title": "Bad Dates 1",
        "slug": f"bad-dates-1-{s['suffix']}",
        "start_date": (now + timedelta(days=10)).isoformat(),
        "submission_deadline": (now + timedelta(days=5)).isoformat(),
        "end_date": (now + timedelta(days=15)).isoformat(),
    }
    res1 = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons",
        json=bad_payload_1,
        cookies={settings.SESSION_COOKIE_NAME: s["charlie_token"]},
        headers=ORIGIN_HEADER,
    )
    assert res1.status_code == 422

    # Case 2: submission_deadline > end_date
    bad_payload_2 = {
        "title": "Bad Dates 2",
        "slug": f"bad-dates-2-{s['suffix']}",
        "start_date": (now + timedelta(days=2)).isoformat(),
        "submission_deadline": (now + timedelta(days=15)).isoformat(),
        "end_date": (now + timedelta(days=10)).isoformat(),
    }
    res2 = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons",
        json=bad_payload_2,
        cookies={settings.SESSION_COOKIE_NAME: s["charlie_token"]},
        headers=ORIGIN_HEADER,
    )
    assert res2.status_code == 422


@pytest.mark.asyncio
async def test_hack_03_publish_hackathon_workflow(client: AsyncClient, db_session, hackathon_test_setup):
    """
    HACK-03: Publish Hackathon Workflow.
    Role: OrgRole.ORG_ADMIN (Bob).
    POST /api/v1/organizations/{org_id}/hackathons/{id}/publish.
    Expected: 200 OK. Status transitions to 'published'. Audit event recorded.
    """
    s = hackathon_test_setup
    now = datetime.now(timezone.utc)

    # 1. Charlie creates draft
    create_res = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons",
        json={
            "title": "Publishable Event",
            "slug": f"pub-event-{s['suffix']}",
            "description": "Comprehensive event description.",
            "start_date": (now + timedelta(days=1)).isoformat(),
            "submission_deadline": (now + timedelta(days=5)).isoformat(),
            "end_date": (now + timedelta(days=8)).isoformat(),
        },
        cookies={settings.SESSION_COOKIE_NAME: s["charlie_token"]},
        headers=ORIGIN_HEADER,
    )
    assert create_res.status_code == 201
    hackathon_id = create_res.json()["id"]

    # 2. Bob (ORG_ADMIN) publishes event
    pub_res = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons/{hackathon_id}/publish",
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    assert pub_res.status_code == 200
    data = pub_res.json()
    assert data["status"] == "published"
    assert "published_at" in data["settings"]

    # Verify audit event
    audit_stmt = select(AuditEvent).where(
        AuditEvent.resource_id == hackathon_id,
        AuditEvent.action == "hackathon_published",
    )
    audit = (await db_session.execute(audit_stmt)).scalar_one_or_none()
    assert audit is not None
    assert audit.organization_id == s["org_a"].id
    assert audit.actor_user_id == s["bob"].id


@pytest.mark.asyncio
async def test_hack_04_organizer_forbidden_from_publishing(client: AsyncClient, hackathon_test_setup):
    """
    HACK-04: Organizer Forbidden from Publishing.
    Role: OrgRole.ORGANIZER (Charlie).
    POST /api/v1/organizations/{org_id}/hackathons/{id}/publish.
    Expected: 403 Forbidden (FORBIDDEN_INSUFFICIENT_ORG_ROLE).
    """
    s = hackathon_test_setup
    now = datetime.now(timezone.utc)

    create_res = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons",
        json={
            "title": "Organizer Restricted Event",
            "slug": f"org-restrict-{s['suffix']}",
            "description": "Valid description.",
            "start_date": (now + timedelta(days=1)).isoformat(),
            "submission_deadline": (now + timedelta(days=3)).isoformat(),
            "end_date": (now + timedelta(days=5)).isoformat(),
        },
        cookies={settings.SESSION_COOKIE_NAME: s["charlie_token"]},
        headers=ORIGIN_HEADER,
    )
    hackathon_id = create_res.json()["id"]

    # Charlie (Organizer) attempts to publish -> 403 Forbidden
    pub_res = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons/{hackathon_id}/publish",
        cookies={settings.SESSION_COOKIE_NAME: s["charlie_token"]},
        headers=ORIGIN_HEADER,
    )
    assert pub_res.status_code == 403
    assert pub_res.json()["code"] == "FORBIDDEN_INSUFFICIENT_ORG_ROLE"


@pytest.mark.asyncio
async def test_hack_05_published_hackathon_slug_immutability(client: AsyncClient, hackathon_test_setup):
    """
    HACK-05: Published Hackathon Slug Immutability.
    Role: OrgRole.ORG_ADMIN (Bob).
    PATCH /api/v1/organizations/{org_id}/hackathons/{id} attempting to change 'slug' on a published hackathon.
    Expected: 400 Bad Request (PUBLISHED_SLUG_IMMUTABLE).
    """
    s = hackathon_test_setup
    now = datetime.now(timezone.utc)

    # 1. Create and publish
    create_res = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons",
        json={
            "title": "Immutable Slug Hackathon",
            "slug": f"immutable-slug-{s['suffix']}",
            "description": "Description text.",
            "start_date": (now + timedelta(days=1)).isoformat(),
            "submission_deadline": (now + timedelta(days=4)).isoformat(),
            "end_date": (now + timedelta(days=6)).isoformat(),
        },
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    hackathon_id = create_res.json()["id"]

    await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons/{hackathon_id}/publish",
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )

    # 2. Attempt to mutate slug on published hackathon
    patch_res = await client.patch(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons/{hackathon_id}",
        json={"slug": f"new-slug-attempt-{s['suffix']}"},
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    assert patch_res.status_code == 400
    assert patch_res.json()["code"] == "PUBLISHED_SLUG_IMMUTABLE"


@pytest.mark.asyncio
async def test_hack_06_request_body_organization_id_injection_blocked(client: AsyncClient, hackathon_test_setup):
    """
    HACK-06: Published Hackathon Organization Immutability & Body Injection Attack.
    Attempt to inject 'organization_id' in Create or Update request body.
    Expected: 422 Unprocessable Entity (extra='forbid').
    """
    s = hackathon_test_setup
    now = datetime.now(timezone.utc)

    # 1. Body injection on create
    create_res = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons",
        json={
            "title": "Injected Org Hackathon",
            "slug": f"injected-org-{s['suffix']}",
            "organization_id": str(s["org_b"].id),  # Attempting to assign to Org B
            "start_date": (now + timedelta(days=1)).isoformat(),
            "submission_deadline": (now + timedelta(days=3)).isoformat(),
            "end_date": (now + timedelta(days=5)).isoformat(),
        },
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    assert create_res.status_code == 422

    # 2. Body injection on update
    valid_create = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons",
        json={
            "title": "Clean Hackathon",
            "slug": f"clean-hackathon-{s['suffix']}",
            "start_date": (now + timedelta(days=1)).isoformat(),
            "submission_deadline": (now + timedelta(days=3)).isoformat(),
            "end_date": (now + timedelta(days=5)).isoformat(),
        },
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    hackathon_id = valid_create.json()["id"]

    patch_res = await client.patch(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons/{hackathon_id}",
        json={"organization_id": str(s["org_b"].id)},
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    assert patch_res.status_code == 422


@pytest.mark.asyncio
async def test_hack_07_duplicate_slug_within_same_org_rejected(client: AsyncClient, hackathon_test_setup):
    """
    HACK-07: Duplicate Slug Within Same Organization Rejected.
    Create second hackathon in Org A with same slug as existing hackathon in Org A.
    Expected: 409 Conflict (HACKATHON_SLUG_TAKEN).
    """
    s = hackathon_test_setup
    now = datetime.now(timezone.utc)
    shared_slug = f"shared-slug-{s['suffix']}"

    res1 = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons",
        json={
            "title": "First Event",
            "slug": shared_slug,
            "start_date": (now + timedelta(days=1)).isoformat(),
            "submission_deadline": (now + timedelta(days=3)).isoformat(),
            "end_date": (now + timedelta(days=5)).isoformat(),
        },
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    assert res1.status_code == 201

    res2 = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons",
        json={
            "title": "Duplicate Slug Event",
            "slug": shared_slug,
            "start_date": (now + timedelta(days=2)).isoformat(),
            "submission_deadline": (now + timedelta(days=4)).isoformat(),
            "end_date": (now + timedelta(days=6)).isoformat(),
        },
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    assert res2.status_code == 409
    assert res2.json()["code"] == "HACKATHON_SLUG_TAKEN"


@pytest.mark.asyncio
async def test_hack_08_identical_slug_across_different_orgs_allowed(client: AsyncClient, hackathon_test_setup):
    """
    HACK-08: Identical Slug Across Different Organizations Allowed.
    Create hackathon with slug in Org A, then create hackathon with same slug in Org B.
    Expected: 201 Created on both. Confirms slug uniqueness is scoped per tenant.
    """
    s = hackathon_test_setup
    now = datetime.now(timezone.utc)
    shared_slug = f"ai-hackathon-annual-{s['suffix']}"

    # Org A
    res_a = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons",
        json={
            "title": "Alpha AI Event",
            "slug": shared_slug,
            "start_date": (now + timedelta(days=1)).isoformat(),
            "submission_deadline": (now + timedelta(days=3)).isoformat(),
            "end_date": (now + timedelta(days=5)).isoformat(),
        },
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    assert res_a.status_code == 201

    # Org B
    res_b = await client.post(
        f"/api/v1/organizations/{s['org_b'].id}/hackathons",
        json={
            "title": "Beta AI Event",
            "slug": shared_slug,
            "start_date": (now + timedelta(days=1)).isoformat(),
            "submission_deadline": (now + timedelta(days=3)).isoformat(),
            "end_date": (now + timedelta(days=5)).isoformat(),
        },
        cookies={settings.SESSION_COOKIE_NAME: s["frank_token"]},
        headers=ORIGIN_HEADER,
    )
    assert res_b.status_code == 201
    assert res_a.json()["id"] != res_b.json()["id"]
    assert res_a.json()["slug"] == res_b.json()["slug"]


@pytest.mark.asyncio
async def test_hack_09_platform_admin_suspends_hackathon(client: AsyncClient, db_session, hackathon_test_setup):
    """
    HACK-09: Platform Admin Suspends Hackathon.
    Role: PlatformRole.PLATFORM_OPS_ADMIN.
    POST /api/v1/admin/hackathons/{id}/status with status='suspended', reason="Terms of service violation".
    Expected: 200 OK. Status becomes 'suspended'. Mandatory audit event recorded with organization_id.
    """
    s = hackathon_test_setup
    now = datetime.now(timezone.utc)

    # 1. Org A creates hackathon
    create_res = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons",
        json={
            "title": "Target for Suspension",
            "slug": f"suspend-target-{s['suffix']}",
            "description": "Description.",
            "start_date": (now + timedelta(days=1)).isoformat(),
            "submission_deadline": (now + timedelta(days=3)).isoformat(),
            "end_date": (now + timedelta(days=5)).isoformat(),
        },
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    hackathon_id = create_res.json()["id"]

    # 2. Platform Ops Admin suspends hackathon
    suspend_res = await client.post(
        f"/api/v1/admin/hackathons/{hackathon_id}/status",
        json={"status": "suspended", "reason": "Terms of service violation"},
        cookies={settings.SESSION_COOKIE_NAME: s["p_ops_token"]},
        headers=ORIGIN_HEADER,
    )
    assert suspend_res.status_code == 200
    assert suspend_res.json()["status"] == "suspended"

    # Verify audit event
    audit_stmt = select(AuditEvent).where(
        AuditEvent.resource_id == hackathon_id,
        AuditEvent.action == "hackathon_status_overridden",
    )
    audit = (await db_session.execute(audit_stmt)).scalar_one_or_none()
    assert audit is not None
    assert audit.organization_id == s["org_a"].id
    assert audit.actor_user_id == s["platform_ops"].id
    assert audit.reason == "Terms of service violation"


# =====================================================================
# Additional Negative & State Transition Verification Tests
# =====================================================================

@pytest.mark.asyncio
async def test_organizer_cannot_edit_other_organizers_hackathon(client: AsyncClient, hackathon_test_setup):
    """
    Table 5.2 Least Privilege:
    Organizer Charlie creates a hackathon.
    Organizer Dave attempts to PATCH Charlie's hackathon.
    Expected: 403 Forbidden (FORBIDDEN_INSUFFICIENT_ORG_ROLE).
    """
    s = hackathon_test_setup
    now = datetime.now(timezone.utc)

    create_res = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons",
        json={
            "title": "Charlie's Hackathon",
            "slug": f"charlie-event-{s['suffix']}",
            "start_date": (now + timedelta(days=1)).isoformat(),
            "submission_deadline": (now + timedelta(days=3)).isoformat(),
            "end_date": (now + timedelta(days=5)).isoformat(),
        },
        cookies={settings.SESSION_COOKIE_NAME: s["charlie_token"]},
        headers=ORIGIN_HEADER,
    )
    hackathon_id = create_res.json()["id"]

    # Dave attempts to edit -> 403 Forbidden
    patch_res = await client.patch(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons/{hackathon_id}",
        json={"title": "Dave's Hijacked Title"},
        cookies={settings.SESSION_COOKIE_NAME: s["dave_token"]},
        headers=ORIGIN_HEADER,
    )
    assert patch_res.status_code == 403
    assert patch_res.json()["code"] == "FORBIDDEN_INSUFFICIENT_ORG_ROLE"

    # Bob (ORG_ADMIN) CAN edit Charlie's hackathon
    admin_patch = await client.patch(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons/{hackathon_id}",
        json={"title": "Bob's Admin Polish"},
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    assert admin_patch.status_code == 200
    assert admin_patch.json()["title"] == "Bob's Admin Polish"


@pytest.mark.asyncio
async def test_hackathon_lifecycle_complete_and_archive(client: AsyncClient, hackathon_test_setup):
    """
    Verifies full lifecycle progression:
    draft -> published -> completed -> archived.
    Verifies that invalid transitions are rejected.
    """
    s = hackathon_test_setup
    now = datetime.now(timezone.utc)

    # 1. Create draft
    create_res = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons",
        json={
            "title": "Lifecycle Test Hackathon",
            "slug": f"lifecycle-{s['suffix']}",
            "description": "Detailed rules and rubrics.",
            "start_date": (now + timedelta(days=1)).isoformat(),
            "submission_deadline": (now + timedelta(days=3)).isoformat(),
            "end_date": (now + timedelta(days=5)).isoformat(),
        },
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    h_id = create_res.json()["id"]

    # Invalid: draft -> completed directly
    invalid_comp = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons/{h_id}/complete",
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    assert invalid_comp.status_code == 400
    assert invalid_comp.json()["code"] == "INVALID_STATUS_TRANSITION"

    # 2. Publish
    pub = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons/{h_id}/publish",
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    assert pub.status_code == 200
    assert pub.json()["status"] == "published"

    # Invalid: published -> archive directly (must complete or cancel first)
    invalid_arch = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons/{h_id}/archive",
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    assert invalid_arch.status_code == 400
    assert invalid_arch.json()["code"] == "INVALID_STATUS_TRANSITION"

    # 3. Complete
    comp = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons/{h_id}/complete",
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    assert comp.status_code == 200
    assert comp.json()["status"] == "completed"

    # 4. Archive
    arch = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons/{h_id}/archive",
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    assert arch.status_code == 200
    assert arch.json()["status"] == "archived"

    # 5. Mutations on archived hackathon are blocked
    blocked_edit = await client.patch(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons/{h_id}",
        json={"title": "Attempted Edit on Archived"},
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    assert blocked_edit.status_code == 403
    assert blocked_edit.json()["code"] == "HACKATHON_ARCHIVED"


@pytest.mark.asyncio
async def test_platform_ops_admin_forbidden_from_archiving_hackathon(client: AsyncClient, hackathon_test_setup):
    """
    Table 5.2 Least Privilege:
    PLATFORM_OPS_ADMIN cannot archive a hackathon via administrative override.
    Only PLATFORM_OWNER is permitted.
    """
    s = hackathon_test_setup
    now = datetime.now(timezone.utc)

    create_res = await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons",
        json={
            "title": "Archival Target",
            "slug": f"arch-target-{s['suffix']}",
            "start_date": (now + timedelta(days=1)).isoformat(),
            "submission_deadline": (now + timedelta(days=3)).isoformat(),
            "end_date": (now + timedelta(days=5)).isoformat(),
        },
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )
    h_id = create_res.json()["id"]

    # Ops Admin attempts to archive -> 403 FORBIDDEN_INSUFFICIENT_ROLE
    ops_archive = await client.post(
        f"/api/v1/admin/hackathons/{h_id}/status",
        json={"status": "archived", "reason": "Ops admin archival attempt"},
        cookies={settings.SESSION_COOKIE_NAME: s["p_ops_token"]},
        headers=ORIGIN_HEADER,
    )
    assert ops_archive.status_code == 403
    assert ops_archive.json()["code"] == "FORBIDDEN_INSUFFICIENT_ROLE"

    # Platform Owner CAN archive -> 200 OK
    owner_archive = await client.post(
        f"/api/v1/admin/hackathons/{h_id}/status",
        json={"status": "archived", "reason": "Platform owner approved archival"},
        cookies={settings.SESSION_COOKIE_NAME: s["p_owner_token"]},
        headers=ORIGIN_HEADER,
    )
    assert owner_archive.status_code == 200
    assert owner_archive.json()["status"] == "archived"


@pytest.mark.asyncio
async def test_unprivileged_platform_roles_denied_admin_hackathons(client: AsyncClient, hackathon_test_setup):
    """
    Verifies that unprivileged platform roles (e.g. SECURITY_ADMIN)
    are rejected from /api/v1/admin/hackathons with 403 FORBIDDEN_INSUFFICIENT_ROLE.
    """
    s = hackathon_test_setup
    res = await client.get(
        "/api/v1/admin/hackathons",
        cookies={settings.SESSION_COOKIE_NAME: s["sec_admin_token"]},
    )
    assert res.status_code == 403
    assert res.json()["code"] == "FORBIDDEN_INSUFFICIENT_ROLE"


@pytest.mark.asyncio
async def test_admin_hackathons_directory_search_and_filters(client: AsyncClient, hackathon_test_setup):
    """
    Tests platform admin oversight directory:
    Search by title/slug, filter by organization_id, filter by status, pagination.
    """
    s = hackathon_test_setup
    now = datetime.now(timezone.utc)

    # Create event in Org A
    await client.post(
        f"/api/v1/organizations/{s['org_a'].id}/hackathons",
        json={
            "title": f"Quantum Compute Challenge {s['suffix']}",
            "slug": f"quantum-compute-{s['suffix']}",
            "start_date": (now + timedelta(days=1)).isoformat(),
            "submission_deadline": (now + timedelta(days=3)).isoformat(),
            "end_date": (now + timedelta(days=5)).isoformat(),
        },
        cookies={settings.SESSION_COOKIE_NAME: s["bob_token"]},
        headers=ORIGIN_HEADER,
    )

    # Query admin directory with search
    res = await client.get(
        f"/api/v1/admin/hackathons?search=Quantum+Compute+{s['suffix']}",
        cookies={settings.SESSION_COOKIE_NAME: s["p_ops_token"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    assert any(item["slug"] == f"quantum-compute-{s['suffix']}" for item in data["items"])
