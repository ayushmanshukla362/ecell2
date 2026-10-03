import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const position = [28.6341, 77.4456];

const customIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/128/684/684908.png",
  iconSize: [35, 45],
  iconAnchor: [17, 42],
  popupAnchor: [0, -36],
});

function ContactMap() {
  return (
    <div className="contact-map">
      <div className="contact-map__head">
        <div>
          <p>Visit us</p>
          <span>ABES Engineering College, Ghaziabad</span>
        </div>
        <span aria-hidden="true">MAP</span>
      </div>
      <div className="contact-map__canvas" aria-label="Map showing ABES Engineering College, Ghaziabad">
        <MapContainer
          center={position}
          zoom={15}
          className="h-full w-full"
          zoomControl={true}
          scrollWheelZoom={true}
          dragging={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="ABES Engineering College, Ghaziabad"
          />
          <Marker position={position} icon={customIcon}>
            <Popup>
              <span className="text-lg font-semibold">ABES Engineering College</span>
              <br />
              Ghaziabad, India
            </Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
}

export default ContactMap;
