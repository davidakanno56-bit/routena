from alembic import op
import sqlalchemy as sa

revision = "0007_demo_dispatch"
down_revision = "0006_driver_onboarding"


def upgrade():
    op.create_table("dispatch_passengers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(254), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(160), nullable=False),
    )
    op.create_table("dispatch_passenger_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("passenger_id", sa.Integer(), sa.ForeignKey("dispatch_passengers.id"), nullable=False),
        sa.Column("expires_at", sa.Integer(), nullable=False),
    )
    op.create_table("dispatch_quotes",
        sa.Column("quote_id", sa.String(36), sa.ForeignKey("quotes.id"), primary_key=True),
        sa.Column("passenger_id", sa.Integer(), sa.ForeignKey("dispatch_passengers.id"), nullable=False),
    )
    op.create_table("dispatch_availability",
        sa.Column("driver_id", sa.Integer(), sa.ForeignKey("driver_accounts.id"), primary_key=True),
        sa.Column("zone_id", sa.Integer(), sa.ForeignKey("service_zones.id"), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("last_seen", sa.Integer(), nullable=False),
        sa.Column("session_hash", sa.String(64), nullable=False),
    )
    op.create_table("dispatch_rides",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("quote_id", sa.String(36), sa.ForeignKey("quotes.id"), unique=True, nullable=False),
        sa.Column("passenger_id", sa.Integer(), sa.ForeignKey("dispatch_passengers.id"), nullable=False),
        sa.Column("driver_id", sa.Integer(), sa.ForeignKey("driver_accounts.id")),
        sa.Column("zone_id", sa.Integer(), sa.ForeignKey("service_zones.id"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("deadline", sa.Integer(), nullable=False),
        sa.Column("offer_until", sa.Integer()),
        sa.Column("pickup_proximity_meters", sa.Integer()),
        sa.Column("attempted", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.Integer(), nullable=False),
    )
    for table, fields in (
        ("dispatch_passenger_sessions", ("passenger_id",)), ("dispatch_quotes", ("passenger_id",)),
        ("dispatch_rides", ("passenger_id", "driver_id", "status")),
    ):
        for field in fields:
            op.create_index(f"ix_{table}_{field}", table, [field])
    lock = op.create_table("dispatch_lock", sa.Column("id", sa.Integer(), primary_key=True),
                           sa.Column("revision", sa.Integer(), nullable=False))
    op.bulk_insert(lock, [{"id": 1, "revision": 0}])


def downgrade():
    for table in ("dispatch_lock", "dispatch_rides", "dispatch_availability", "dispatch_quotes",
                  "dispatch_passenger_sessions", "dispatch_passengers"):
        op.drop_table(table)
