"""Create persistent authentication event and alert tables.

Revision ID: 20261012_01
Revises:
Create Date: 2026-10-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261012_01"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "authentication_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=False),
        sa.Column("username", sa.String(length=255), nullable=False),
        sa.Column("outcome", sa.String(length=16), nullable=False),
    )
    op.create_index("ix_authentication_events_timestamp", "authentication_events", ["timestamp"])
    op.create_index("ix_authentication_events_ip_address", "authentication_events", ["ip_address"])
    op.create_index("ix_authentication_events_outcome", "authentication_events", ["outcome"])

    op.create_table(
        "security_alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=False),
        sa.Column("first_failure", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_failure", sa.DateTime(timezone=True), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("failure_count", sa.Integer(), nullable=False),
        sa.Column("usernames", sa.JSON(), nullable=False),
        sa.Column("message", sa.String(length=1000), nullable=False),
        sa.UniqueConstraint("fingerprint", name="uq_security_alerts_fingerprint"),
    )
    op.create_index("ix_security_alerts_ip_address", "security_alerts", ["ip_address"])
    op.create_index("ix_security_alerts_last_failure", "security_alerts", ["last_failure"])


def downgrade() -> None:
    op.drop_index("ix_security_alerts_last_failure", table_name="security_alerts")
    op.drop_index("ix_security_alerts_ip_address", table_name="security_alerts")
    op.drop_table("security_alerts")
    op.drop_index("ix_authentication_events_outcome", table_name="authentication_events")
    op.drop_index("ix_authentication_events_ip_address", table_name="authentication_events")
    op.drop_index("ix_authentication_events_timestamp", table_name="authentication_events")
    op.drop_table("authentication_events")
