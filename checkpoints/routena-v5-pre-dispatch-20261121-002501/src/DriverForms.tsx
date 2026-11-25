import { useState, type ReactNode } from 'react';
import { field, vehicles, type Application, type Category, type City, type FuelType, type ProfileInput, type VehicleInput } from './driverApi';

export function InputField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="v5-field"><span>{label}</span>{children}</label>;
}

export function ProfileFields({ cities, application }: { cities: City[]; application?: Application }) {
  return (
    <>
      <InputField label="Full name"><input name="full_name" defaultValue={application?.full_name} autoComplete="off" placeholder="Demo Driver" required minLength={2} maxLength={120} /></InputField>
      <InputField label="Synthetic phone number"><input name="phone" defaultValue={application?.phone} type="tel" autoComplete="off" placeholder="+2340000000001" required pattern="[+][1-9][0-9]{7,14}" /></InputField>
      <InputField label="Operating city">
        <select key={cities.map(city => city.id).join(',')} name="city_id" required defaultValue={cities.some(city => city.id === application?.city_id) ? application?.city_id : ''}>
          <option value="">Select a city and state</option>
          {cities.map(city => <option key={city.id} value={city.id}>{city.city}, {city.state}</option>)}
        </select>
      </InputField>
    </>
  );
}

export function profileInput(data: FormData): ProfileInput {
  return { full_name: field(data, 'full_name').trim(), phone: field(data, 'phone').trim(), city_id: Number(field(data, 'city_id')) };
}

export function VehicleFields({ application }: { application: Application }) {
  const saved = application.vehicle;
  const [category, setCategory] = useState<Category>(saved?.category ?? 'Economy');
  return (
    <>
      <fieldset className="v5-category-field">
        <legend>Vehicle category</legend>
        <div className="v5-categories">
          {vehicles.map(option => (
            <label className={'v5-category' + (category === option.category ? ' selected' : '')} key={option.category}>
              <input type="radio" name="category" value={option.category} checked={category === option.category} onChange={() => setCategory(option.category)} />
              <img src={`/vehicles/${option.image}.webp`} alt="" />
              <strong>{option.category}</strong>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="v5-fields-two">
        <InputField label="Manufacturer"><input name="manufacturer" defaultValue={saved?.manufacturer} required maxLength={60} placeholder="Demo Motors" /></InputField>
        <InputField label="Model"><input name="model" defaultValue={saved?.model} required maxLength={60} placeholder="Demo Compact" /></InputField>
        <InputField label="Year"><input name="year" type="number" min={1980} max={new Date().getUTCFullYear() + 1} step={1} defaultValue={saved?.year} required /></InputField>
        <InputField label="Colour"><input name="colour" defaultValue={saved?.colour} required maxLength={40} /></InputField>
        <InputField label="Demo registration number"><input name="registration_number" defaultValue={saved?.registration_number} placeholder="DEMO-CAR01" pattern="DEMO-[A-Z0-9\-]{2,26}" required autoComplete="off" /></InputField>
        <InputField label="Fuel type">
          <select name="fuel_type" defaultValue={saved?.fuel_type ?? 'PMS'}>
            <option value="PMS">Petrol (PMS)</option><option value="DIESEL">Diesel</option>
            <option value="HYBRID">Hybrid</option><option value="ELECTRIC">Electric</option>
          </select>
        </InputField>
      </div>
      <InputField label="Claimed fuel efficiency in km/L (optional)">
        <input name="claimed_fuel_efficiency" type="number" min={0.001} max={200} step={0.001} defaultValue={saved?.claimed_fuel_efficiency ?? ''} />
      </InputField>
      <p className="v5-muted">Fuel efficiency claims are unverified and do not affect Routena fare rules.</p>
      {saved && application.vehicle_documents_ready && <p className="v5-muted">Saving the vehicle again requires you to reconfirm its demo document checklist.</p>}
    </>
  );
}

export function vehicleInput(data: FormData): VehicleInput {
  const efficiency = field(data, 'claimed_fuel_efficiency');
  return {
    category: field(data, 'category') as Category, manufacturer: field(data, 'manufacturer').trim(),
    model: field(data, 'model').trim(), year: Number(field(data, 'year')), colour: field(data, 'colour').trim(),
    registration_number: field(data, 'registration_number').trim(), fuel_type: field(data, 'fuel_type') as FuelType,
    claimed_fuel_efficiency: efficiency ? Number(efficiency) : null,
  };
}

export function DocumentFields({ application }: { application: Application }) {
  return (
    <>
      <p className="notice">Use a made-up reference. Keep real licence numbers, images, and identity documents out of this demo.</p>
      <InputField label="Demo licence reference">
        <input name="licence_placeholder" required pattern="DEMO-[A-Z0-9\-]{2,26}"
          defaultValue={application.licence_placeholder ?? ''} placeholder="DEMO-LIC01" autoComplete="off" />
      </InputField>
      <label className="v5-check">
        <input type="checkbox" name="vehicle_documents_ready" defaultChecked={application.vehicle_documents_ready} required />
        <span>I have prepared the synthetic vehicle registration and document placeholders for demo review.</span>
      </label>
    </>
  );
}

export function ApplicationSummary({ application }: { application: Application }) {
  const { vehicle } = application;
  return (
    <dl className="v5-facts">
      <div><dt>Driver</dt><dd>{application.full_name}</dd></div>
      <div><dt>Operating area</dt><dd>{application.city}, {application.state}</dd></div>
      <div><dt>Registered vehicle</dt><dd>{vehicle ? `${vehicle.category} / ${vehicle.manufacturer} ${vehicle.model}` : 'Vehicle needed'}</dd></div>
      <div><dt>Demo documents</dt><dd>{application.vehicle_documents_ready ? 'Placeholders ready for review' : 'Checklist incomplete'}</dd></div>
    </dl>
  );
}
