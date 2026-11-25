from alembic import op
import sqlalchemy as sa

revision = "0004_driver_economics_rules"
down_revision = "0003_demo_fuel_flag"


def upgrade():
    with op.batch_alter_table("fare_rules") as batch:
        batch.add_column(sa.Column("vehicle_class", sa.String(30), nullable=True))
        batch.add_column(sa.Column("pickup_distance_km", sa.Numeric(12, 3), nullable=True))
        batch.add_column(sa.Column("pickup_time_minutes", sa.Numeric(12, 2), nullable=True))
        batch.add_column(sa.Column("traffic_delay_minutes", sa.Numeric(12, 2), nullable=True))
        batch.add_column(sa.Column("operating_overhead_per_km", sa.Numeric(12, 2), nullable=True))
        batch.add_column(sa.Column("minimum_driver_contribution_margin", sa.Numeric(12, 2), nullable=True))
        batch.add_column(sa.Column("driver_earnings_target", sa.Numeric(12, 2), nullable=True))
        batch.add_column(sa.Column("minimum_trip_fare", sa.Numeric(12, 2), nullable=True))


def downgrade():
    with op.batch_alter_table("fare_rules") as batch:
        for column in (
            "minimum_trip_fare", "driver_earnings_target",
            "minimum_driver_contribution_margin", "operating_overhead_per_km",
            "traffic_delay_minutes", "pickup_time_minutes", "pickup_distance_km",
            "vehicle_class",
        ):
            batch.drop_column(column)
