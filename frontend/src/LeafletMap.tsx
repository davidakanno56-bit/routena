import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { decodePolyline, type Coordinates, type StopKey, type Stops } from './locations';
import type { RoadRoute } from './api';

export function LeafletMap({ stops, route, target, onSelect }: {
  stops: Stops; route: RoadRoute | null; target: StopKey | null;
  onSelect: (key: StopKey, point: Coordinates) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);

  useEffect(() => {
    if (!element.current) return;
    const map = L.map(element.current, { scrollWheelZoom: false, zoomControl: false, worldCopyJump: true })
      .setView([5.03, 8.33], 14);
    mapRef.current = map;
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).on('tileerror', () => setTilesUnavailable(true))
      .on('tileload', () => setTilesUnavailable(false)).addTo(map);
    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(element.current);
    return () => {
      resize.disconnect();
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !target) return;
    const select = (event: L.LeafletMouseEvent) => {
      const { lat, lng } = event.latlng.wrap();
      onSelect(target, { latitude: lat, longitude: lng });
    };
    map.on('click', select);
    return () => { map.off('click', select); };
  }, [target, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = L.featureGroup().addTo(map);
    if (route) {
      const points = decodePolyline(route.polyline);
      L.polyline(points, { color: '#fff', weight: 10, interactive: false }).addTo(layers);
      L.polyline(points, { color: '#0879ee', weight: 5, interactive: false }).addTo(layers);
    }
    (['pickup', 'destination'] as const).forEach((key, index) => {
      const point = stops[key];
      if (!point) return;
      const label = key === 'pickup' ? 'Pickup' : 'Destination';
      const icon = L.divIcon({
        className: 'map-pin map-pin-' + index,
        iconSize: [34, 34],
        html: index === 0 ? '<span>A</span>' : '<span>B</span>',
      });
      const marker = L.marker([point.latitude, point.longitude], {
        icon, title: label, alt: label + ' marker', draggable: true,
      }).bindTooltip(label).addTo(layers);
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng().wrap();
        onSelect(key, { latitude: lat, longitude: lng });
      });
    });
    const bounds = layers.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [44, 48], maxZoom: 15, animate: false });
    return () => { layers.remove(); };
  }, [stops, route, onSelect]);

  return (
    <div className={'map-frame booking-map-frame' + (target ? ' picking' : '')}>
      <div ref={element} className="leaflet-map" aria-label="Map of selected stops" />
      {target && <span className="map-crosshair" aria-hidden="true" />}
      <div className="map-route-pill"><span />{target ? 'Tap to place ' + target : route ? 'Road route' : 'Selected stops'}</div>
      {target && <button type="button" className="map-center-button" onClick={() => {
        const center = mapRef.current?.getCenter().wrap();
        if (center) onSelect(target, { latitude: center.lat, longitude: center.lng });
      }}>Use map centre</button>}
      {tilesUnavailable && <small className="map-attribution-note">Map tiles unavailable</small>}
    </div>
  );
}
