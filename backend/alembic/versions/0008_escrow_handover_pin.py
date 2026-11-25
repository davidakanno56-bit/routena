from alembic import op
import sqlalchemy as sa

revision = "0008_escrow_handover_pin"
down_revision = "0007_demo_dispatch"


def upgrade():
    op.add_column("dispatch_rides", sa.Column("escrow_pin", sa.String(6), nullable=True))
    op.add_column("dispatch_rides", sa.Column("escrow_amount", sa.String(32), nullable=True))
    op.add_column("dispatch_rides", sa.Column("platform_fee", sa.String(32), nullable=True))
    op.add_column("dispatch_rides", sa.Column("driver_payout", sa.String(32), nullable=True))
    op.add_column("dispatch_rides", sa.Column("payout_status", sa.String(32), nullable=True, server_default="HELD_IN_ESCROW"))


def downgrade():
    with op.batch_alter_table("dispatch_rides") as batch_op:
        batch_op.drop_column("payout_status")
        batch_op.drop_column("driver_payout")
        batch_op.drop_column("platform_fee")
        batch_op.drop_column("escrow_amount")
        batch_op.drop_column("escrow_pin")
