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
    return <div className="map-fallback" role="status">Route geometry is unavailable for this plan. The itinerary below still contains the scheduled stops.</div>
  }

  return <div className="route-map" aria-label="Planned truck route map">
    <MapContainer center={points[0]} zoom={7} scrollWheelZoom={false} aria-label="OpenStreetMap route view">
      <TileLayer
        attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline positions={points} pathOptions={{ color: '#ec7e27', weight: 5, opacity: 0.9 }} />
      <MapBounds points={points} />
      {markers.map((marker, index) => <CircleMarker key={`${marker.label}-${index}`} center={[marker.position.lat, marker.position.lng]} radius={9} pathOptions={{ color: '#fffefa', weight: 3, fillColor: marker.color, fillOpacity: 1 }}>
        <Popup>{marker.label}</Popup>
      </CircleMarker>)}
    </MapContainer>
    <ul className="sr-only" aria-label="Map stop markers">{markers.map((marker, index) => <li key={`${marker.label}-description-${index}`}>{marker.label}</li>)}</ul>
    <ul className="map-legend" aria-label="Route map legend">
      <li><i className="pickup" />Pickup</li><li><i className="delivery" />Delivery</li><li><i className="fuel" />Fuel</li><li><i className="rest" />Break or reset</li>
    </ul>
  </div>
}
