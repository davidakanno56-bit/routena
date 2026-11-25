from alembic import op
import sqlalchemy as sa

revision = "0002_nationwide_service_areas"
down_revision = "0001_fuel_and_quotes"

STATES = [
    ("Abia", "AB"), ("Adamawa", "AD"), ("Akwa Ibom", "AK"), ("Anambra", "AN"),
    ("Bauchi", "BA"), ("Bayelsa", "BY"), ("Benue", "BE"), ("Borno", "BO"),
    ("Cross River", "CR"), ("Delta", "DE"), ("Ebonyi", "EB"), ("Edo", "ED"),
    ("Ekiti", "EK"), ("Enugu", "EN"), ("Gombe", "GO"), ("Imo", "IM"),
    ("Jigawa", "JI"), ("Kaduna", "KD"), ("Kano", "KN"), ("Katsina", "KT"),
    ("Kebbi", "KE"), ("Kogi", "KO"), ("Kwara", "KW"), ("Lagos", "LA"),
    ("Nasarawa", "NA"), ("Niger", "NI"), ("Ogun", "OG"), ("Ondo", "ON"),
    ("Osun", "OS"), ("Oyo", "OY"), ("Plateau", "PL"), ("Rivers", "RI"),
    ("Sokoto", "SO"), ("Taraba", "TA"), ("Yobe", "YO"), ("Zamfara", "ZA"),
    ("Federal Capital Territory", "FC"),
]


def upgrade():
    op.create_table("nigerian_states", sa.Column("id", sa.Integer, primary_key=True),
                    sa.Column("name", sa.String(100), nullable=False, unique=True),
                    sa.Column("code", sa.String(3), nullable=False, unique=True))
    op.create_table("cities", sa.Column("id", sa.Integer, primary_key=True),
                    sa.Column("state_id", sa.Integer, sa.ForeignKey("nigerian_states.id"), nullable=False),
                    sa.Column("name", sa.String(100), nullable=False), sa.Column("timezone", sa.String(80), nullable=False),
                    sa.Column("currency", sa.String(3), nullable=False), sa.Column("is_active", sa.Boolean, nullable=False),
                    sa.Column("operating_status", sa.String(20), nullable=False))
    op.create_table("service_zones", sa.Column("id", sa.Integer, primary_key=True),
                    sa.Column("city_id", sa.Integer, sa.ForeignKey("cities.id"), nullable=False),
                    sa.Column("name", sa.String(100), nullable=False), sa.Column("boundary_geojson", sa.Text),
                    sa.Column("active", sa.Boolean, nullable=False))
    op.create_table("fare_rules", sa.Column("id", sa.Integer, primary_key=True),
                    sa.Column("city_id", sa.Integer, sa.ForeignKey("cities.id"), nullable=False),
                    sa.Column("version", sa.String(50), nullable=False), sa.Column("base_driver_allowance", sa.Numeric(12,2), nullable=False),
                    sa.Column("maintenance_per_km", sa.Numeric(12,2), nullable=False), sa.Column("time_allowance_per_minute", sa.Numeric(12,2), nullable=False),
                    sa.Column("fuel_efficiency_km_per_litre", sa.Numeric(12,3), nullable=False), sa.Column("commission_rate", sa.Numeric(8,5), nullable=False),
                    sa.Column("rounding_increment", sa.Numeric(12,2), nullable=False), sa.Column("active", sa.Boolean, nullable=False))
    op.bulk_insert(sa.table("nigerian_states", sa.column("name", sa.String), sa.column("code", sa.String)),
                   [{"name": name, "code": code} for name, code in STATES])
    with op.batch_alter_table("pricing_zones") as batch:
        batch.add_column(sa.Column("city_id", sa.Integer, sa.ForeignKey("cities.id", name="fk_pricing_zones_city")))
        batch.add_column(sa.Column("service_zone_id", sa.Integer, sa.ForeignKey("service_zones.id", name="fk_pricing_zones_service_zone")))


def downgrade():
    with op.batch_alter_table("pricing_zones") as batch:
        batch.drop_column("service_zone_id")
        batch.drop_column("city_id")
    for table in ("fare_rules", "service_zones", "cities", "nigerian_states"):
        op.drop_table(table)
