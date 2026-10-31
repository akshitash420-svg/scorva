from datetime import datetime
from typing import List, Optional
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from apps.api.modules.organizations.models import OrganizationStatus, OrgRole


class OrganizationDashboardBase(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")


class OrganizationDashboardHackathon(OrganizationDashboardBase):
    id: uuid.UUID
    title: str
    status: str
    start_date: datetime
    end_date: datetime
    organizer_name: Optional[str] = None
    team_count: int
    submission_count: int
    evaluation_total: int
    evaluation_completed: int
    evaluation_pending: int
    evaluation_in_progress: int
    results_finalized: bool


class OrganizationDashboardResponse(OrganizationDashboardBase):
    id: uuid.UUID
    name: str
    slug: str
    status: OrganizationStatus
    owner_id: uuid.UUID
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    current_user_role: OrgRole
    created_at: datetime
    settings: dict
    total_hackathons: int
    active_hackathons: int
    upcoming_hackathons: int
    completed_hackathons: int
    total_teams: int
    teams_with_submissions: int
    total_submissions: int
    pending_submissions: int
    evaluations_completed: int
    evaluations_pending: int
    evaluations_in_progress: int
    finalized_results: int
    hackathons: List[OrganizationDashboardHackathon]


class OrganizationTeamListItem(OrganizationDashboardBase):
    id: uuid.UUID
    name: str
    team_number: str
    hackathon_id: uuid.UUID
    hackathon_name: str
    leader_name: Optional[str] = None
    leader_email: Optional[str] = None
    member_count: int
    registered_at: datetime
    submission_id: Optional[uuid.UUID] = None
    submission_title: Optional[str] = None
    submission_description: Optional[str] = None
    repository_url: Optional[str] = None
    submission_status: str
    evaluation_status: str


class OrganizationTeamPage(OrganizationDashboardBase):
    items: List[OrganizationTeamListItem]
    total: int
    page: int
    limit: int
    total_pages: int


class OrganizationTeamMember(OrganizationDashboardBase):
    id: uuid.UUID
    name: str
    email: str
    role: str
    joined_at: datetime


class OrganizationTeamDetailResponse(OrganizationDashboardBase):
    id: uuid.UUID
    name: str
    team_number: str
    hackathon_id: uuid.UUID
    hackathon_name: str
    created_at: datetime
    members: List[OrganizationTeamMember]
    submission_id: Optional[uuid.UUID] = None
    submission_title: Optional[str] = None
    submission_description: Optional[str] = None
    repository_url: Optional[str] = None
    submission_status: str
    evaluation_status: str


class OrganizationActivityItem(OrganizationDashboardBase):
    id: uuid.UUID
    actor: str
    actor_role: str
    action: str
    related_entity: str
    related_entity_id: str
    hackathon_name: Optional[str] = None
    timestamp: datetime
    description: Optional[str] = None


class OrganizationActivityResponse(OrganizationDashboardBase):
    items: List[OrganizationActivityItem]
    total: int
    page: int
    limit: int
    total_pages: int


class UpdateOrganizationSettingsRequest(OrganizationDashboardBase):
    timezone: Optional[str] = Field(default=None, min_length=1, max_length=100)
    max_hackathons: Optional[int] = Field(default=None, ge=1, le=10000)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            try:
                ZoneInfo(value)
            except ZoneInfoNotFoundError as exc:
                raise ValueError("Timezone must be a valid IANA timezone.") from exc
        return value

    @model_validator(mode="after")
    def require_setting(self) -> "UpdateOrganizationSettingsRequest":
        if self.timezone is None and self.max_hackathons is None:
            raise ValueError("At least one supported setting must be provided.")
        return self
