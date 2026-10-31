import uuid
from base64 import b64decode

import pytest
from httpx import AsyncClient
from sqlalchemy import delete

from apps.api.config import settings
from apps.api.modules.users.models import User, UserSession


def _multipart_fields(fields: dict[str, str]) -> dict[str, tuple[None, str]]:
    return {key: (None, value) for key, value in fields.items()}


@pytest.fixture
async def participant_support_users(
    create_user_helper,
    create_session_helper,
    db_session,
):
    created_user_ids: list[uuid.UUID] = []

    async def create_participant(full_name: str) -> tuple[User, str]:
        user = await create_user_helper(
            email=f"support-{uuid.uuid4()}@scorva.io",
            full_name=full_name,
            platform_role=None,
        )
        created_user_ids.append(user.id)
        return user, await create_session_helper(user)

    yield create_participant

    if created_user_ids:
        await db_session.execute(
            delete(UserSession).where(UserSession.user_id.in_(created_user_ids))
        )
        await db_session.execute(delete(User).where(User.id.in_(created_user_ids)))
        await db_session.commit()


def _support_fields(category: str, conditional_fields: dict[str, str]) -> dict[str, str]:
    return {
        "category": category,
        "team_name": "Test Team",
        "subject": "Support request test",
        "description": "A detailed description of this support request.",
        **conditional_fields,
    }


@pytest.mark.asyncio
async def test_participant_support_create_list_and_private_attachment(
    client: AsyncClient,
    participant_support_users,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    _, token = await participant_support_users("Support Test Participant")
    monkeypatch.setattr(settings, "SUPPORT_ATTACHMENT_DIR", str(tmp_path))
    headers = {"Origin": "http://localhost:3000"}
    client.cookies.set(settings.SESSION_COOKIE_NAME, token)

    project_fields = _support_fields(
        "Project Submission",
        {"block_number": "Block 2", "lab_number": "Lab 4"},
    )
    created = await client.post(
        "/api/v1/participant/support/tickets",
        files={
            **_multipart_fields(project_fields),
            "attachment": (
                "proof.png",
                b64decode(
                    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1sAAAAASUVORK5CYII="
                ),
                "image/png",
            ),
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    project_ticket = created.json()
    assert project_ticket["team_name"] == "Test Team"
    assert project_ticket["team_number"] is None
    assert project_ticket["block_number"] == "Block 2"
    assert project_ticket["lab_number"] == "Lab 4"
    assert project_ticket["attachment_name"] == "proof.png"
    assert project_ticket["ticket_number"].startswith("SCV-")

    github_fields = _support_fields(
        "GitHub / Repository Issue",
        {"block_number": "Block 10", "lab_number": "Lab 10"},
    )
    github_created = await client.post(
        "/api/v1/participant/support/tickets",
        files=_multipart_fields(github_fields),
        headers=headers,
    )
    assert github_created.status_code == 201, github_created.text

    venue_fields = _support_fields(
        "Venue / Seating Query",
        {"team_number": "Team 42"},
    )
    venue_created = await client.post(
        "/api/v1/participant/support/tickets",
        files=_multipart_fields(venue_fields),
        headers=headers,
    )
    assert venue_created.status_code == 201, venue_created.text
    venue_ticket = venue_created.json()
    assert venue_ticket["team_name"] == "Test Team"
    assert venue_ticket["team_number"] == "Team 42"
    assert venue_ticket["block_number"] is None
    assert venue_ticket["lab_number"] is None

    listed = await client.get("/api/v1/participant/support/tickets")
    assert listed.status_code == 200, listed.text
    listed_tickets = listed.json()
    assert len(listed_tickets) == 3
    assert {ticket["category"] for ticket in listed_tickets} == {
        "Project Submission",
        "GitHub / Repository Issue",
        "Venue / Seating Query",
    }

    download = await client.get(project_ticket["attachment_url"])
    assert download.status_code == 200
    assert download.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert download.headers["content-disposition"].startswith("attachment;")

    _, other_token = await participant_support_users("Other Support Participant")
    client.cookies.set(settings.SESSION_COOKIE_NAME, other_token)
    other_list = await client.get("/api/v1/participant/support/tickets")
    assert other_list.status_code == 200
    assert other_list.json() == []
    other_detail = await client.get(
        f"/api/v1/participant/support/tickets/{project_ticket['id']}",
    )
    assert other_detail.status_code == 403
    other_download = await client.get(project_ticket["attachment_url"])
    assert other_download.status_code == 404


@pytest.mark.asyncio
async def test_participant_support_empty_list_and_validation(
    client: AsyncClient,
    participant_support_users,
) -> None:
    _, token = await participant_support_users("Empty Support Participant")
    client.cookies.set(settings.SESSION_COOKIE_NAME, token)
    empty_list = await client.get("/api/v1/participant/support/tickets")
    assert empty_list.status_code == 200
    assert empty_list.json() == []

    headers = {"Origin": "http://localhost:3000"}
    venue_without_team_number = await client.post(
        "/api/v1/participant/support/tickets",
        files=_multipart_fields(
            _support_fields("Venue / Seating Query", {})
        ),
        headers=headers,
    )
    assert venue_without_team_number.status_code == 422

    invalid_block = await client.post(
        "/api/v1/participant/support/tickets",
        files=_multipart_fields(
            _support_fields(
                "Project Submission",
                {"block_number": "Block 11", "lab_number": "Lab 1"},
            )
        ),
        headers=headers,
    )
    assert invalid_block.status_code == 422

    missing_required_field = await client.post(
        "/api/v1/participant/support/tickets",
        files=_multipart_fields({
            "category": "Project Submission",
            "team_name": "Test Team",
            "block_number": "Block 1",
            "lab_number": "Lab 1",
            "description": "A detailed description of this support request.",
        }),
        headers=headers,
    )
    assert missing_required_field.status_code == 422

    invalid_attachment = await client.post(
        "/api/v1/participant/support/tickets",
        files={
            **_multipart_fields(
                _support_fields(
                    "Technical Issue",
                    {"block_number": "Block 1", "lab_number": "Lab 1"},
                )
            ),
            "attachment": ("not-an-image.png", b"not a PNG", "image/png"),
        },
        headers=headers,
    )
    assert invalid_attachment.status_code == 422

    oversized_attachment = await client.post(
        "/api/v1/participant/support/tickets",
        files={
            **_multipart_fields(
                _support_fields(
                    "Technical Issue",
                    {"block_number": "Block 1", "lab_number": "Lab 1"},
                )
            ),
            "attachment": (
                "oversized.png",
                b"\x89PNG\r\n\x1a\n" + b"x" * (5 * 1024 * 1024),
                "image/png",
            ),
        },
        headers=headers,
    )
    assert oversized_attachment.status_code == 413
