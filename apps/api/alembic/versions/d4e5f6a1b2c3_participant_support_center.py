"""participant support center

Revision ID: d4e5f6a1b2c3
Revises: c3d4e5f6a1b2
Create Date: 2026-10-31 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "d4e5f6a1b2c3"
down_revision = "c3d4e5f6a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "participant_support_tickets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("hackathon_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("ticket_number", sa.String(length=32), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("team_name", sa.String(length=200), nullable=False),
        sa.Column("team_number", sa.String(length=100), nullable=True),
        sa.Column("block_number", sa.String(length=50), nullable=True),
        sa.Column("lab_number", sa.String(length=100), nullable=True),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("attachment_url", sa.String(length=500), nullable=True),
        sa.Column("attachment_name", sa.String(length=255), nullable=True),
        sa.Column("attachment_content_type", sa.String(length=100), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="open", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "category IN ('Project Submission', 'GitHub / Repository Issue', "
            "'Team & Member Issue', 'AI Evaluation / Judging', "
            "'Results & Leaderboard', 'Account & Login', 'Event Related', "
            "'Venue / Seating Query', 'Technical Issue', 'Other')",
            name="ck_participant_support_ticket_category",
        ),
        sa.CheckConstraint(
            "(category = 'Venue / Seating Query' AND team_number IS NOT NULL "
            "AND block_number IS NULL AND lab_number IS NULL) OR "
            "(category <> 'Venue / Seating Query' AND team_number IS NULL "
            "AND block_number IS NOT NULL AND lab_number IS NOT NULL)",
            name="ck_participant_support_ticket_conditional_fields",
        ),
        sa.CheckConstraint(
            "block_number IS NULL OR block_number IN "
            "('Block 1', 'Block 2', 'Block 3', 'Block 4', 'Block 5', "
            "'Block 6', 'Block 7', 'Block 8', 'Block 9', 'Block 10')",
            name="ck_participant_support_ticket_block_number",
        ),
        sa.CheckConstraint(
            "status IN ('open', 'in_progress', 'waiting_response', 'resolved', 'closed')",
            name="ck_participant_support_ticket_status",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["hackathon_id"], ["hackathons.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ticket_number", name="uq_participant_support_ticket_number"),
    )
    op.create_index(
        "ix_participant_support_tickets_user_created",
        "participant_support_tickets",
        ["user_id", "created_at"],
    )

    op.create_table(
        "participant_support_replies",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_name", sa.String(length=200), nullable=False),
        sa.Column("is_staff", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["ticket_id"], ["participant_support_tickets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_participant_support_replies_ticket_created",
        "participant_support_replies",
        ["ticket_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_participant_support_replies_ticket_created", table_name="participant_support_replies")
    op.drop_table("participant_support_replies")
    op.drop_index("ix_participant_support_tickets_user_created", table_name="participant_support_tickets")
    op.drop_table("participant_support_tickets")
