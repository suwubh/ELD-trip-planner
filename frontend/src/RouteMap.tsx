import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { useEffect } from 'react'
import type { PlanEvent, RouteResponse } from './api'
import { deriveMapMarkers } from './routeMapMarkers'
import 'leaflet/dist/leaflet.css'

type RouteMapProps = {
  route: RouteResponse
  events: PlanEvent[]
}

function MapBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap()

  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [28, 28] })
  }, [map, points])

  return null
}

export function RouteMap({ route, events }: RouteMapProps) {
  const points = route.geometry
  const markers = deriveMapMarkers(route, events)

  if (points.length < 2) {
    return (
      <div className="map-fallback" role="status">
        Route geometry is unavailable for this plan. The itinerary below still contains the scheduled stops.
      </div>
    )
  }

  return (
    <div className="route-map" aria-label="Planned truck route map">
      <MapContainer
        center={points[0]}
        zoom={7}
        scrollWheelZoom={false}
        aria-label="OpenStreetMap route view"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline
          positions={points}
          pathOptions={{ color: '#0284c7', weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }}
        />
        <MapBounds points={points} />
        {markers.map((marker, index) => (
          <CircleMarker
            key={`${marker.label}-${index}`}
            center={[marker.position.lat, marker.position.lng]}
            radius={10}
            pathOptions={{ color: '#ffffff', weight: 2.5, fillColor: marker.color, fillOpacity: 1 }}
          >
            <Popup className="route-marker-popup">
              <div style={{ minWidth: '180px', padding: '2px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '15px' }}>{marker.symbol}</span>
                  <strong style={{ color: marker.color, fontSize: '13px' }}>{marker.label}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.4 }}>
                  <div><strong>Scheduled:</strong> {marker.time}</div>
                  <div><strong>Duration:</strong> {marker.durationMinutes} min</div>
                  {marker.reason && <div style={{ marginTop: '4px', color: '#64748b' }}>{marker.reason}</div>}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <ul className="sr-only" aria-label="Map stop markers">
        {markers.map((marker, index) => (
          <li key={`${marker.label}-description-${index}`}>{marker.label}</li>
        ))}
      </ul>
      <ul className="map-legend" aria-label="Route map legend">
        <li><i className="pickup" style={{ background: '#ec7e27' }} />Pickup</li>
        <li><i className="delivery" style={{ background: '#3ba272' }} />Delivery</li>
        <li><i className="fuel" style={{ background: '#2b6cb0' }} />Fuel Stop</li>
        <li><i className="rest" style={{ background: '#805ad5' }} />Break / Reset</li>
      </ul>
    </div>
  )
}
