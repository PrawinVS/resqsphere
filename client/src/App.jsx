
import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Polyline,
  useMap
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: "▦" },
  { id: "tracking", label: "Live Tracking", icon: "⌖" },
  { id: "accidents", label: "Accident Logs", icon: "!" },
  { id: "contacts", label: "Emergency Contacts", icon: "♧" },
  { id: "hardware", label: "Hardware Status", icon: "⌘" }
];

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "--"
    : date.toLocaleDateString("en-IN");
}

function formatTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "--"
    : date.toLocaleTimeString("en-IN");
}

function formatTimestamp(value) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "--"
    : date.toLocaleString("en-IN");
}

function coordinate(value) {
  return Number.isFinite(value) ? value.toFixed(6) : "--";
}

function valueWithUnit(value, unit = "") {
  return Number.isFinite(value)
    ? `${value.toFixed(2)}${unit}`
    : "--";
}

function MapRecenter({ location }) {
  const map = useMap();

  useEffect(() => {
    if (
      location?.gpsFix &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude)
    ) {
      map.setView(
        [location.latitude, location.longitude],
        Math.max(map.getZoom(), 15)
      );
    }
  }, [map, location?.latitude, location?.longitude, location?.gpsFix]);

  return null;
}

function VehicleMap({ location, large = false }) {
  const hasFix =
    location?.gpsFix === true &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude);

  return (
    <div className={`map-frame ${large ? "map-large" : ""}`}>
      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={hasFix ? 15 : 5}
        scrollWheelZoom
        className="vehicle-map"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapRecenter location={location} />

        {hasFix && (
          <CircleMarker
            center={[location.latitude, location.longitude]}
            radius={10}
            pathOptions={{
              color: "#ffffff",
              weight: 3,
              fillColor:
                location.eventType === "ROLLOVER_CANDIDATE"
                  ? "#dc2626"
                  : "#2563eb",
              fillOpacity: 1
            }}
          >
            <Popup>
              <strong>ResQLink Vehicle</strong>
              <br />
              {location.vehicleNumber}
              <br />
              Latitude: {coordinate(location.latitude)}
              <br />
              Longitude: {coordinate(location.longitude)}
              <br />
              Status: {location.eventType}
            </Popup>
          </CircleMarker>
        )}
      </MapContainer>

      {!hasFix && (
        <div className="map-overlay">
          GPS fix unavailable — waiting for valid coordinates
        </div>
      )}
    </div>
  );
}

function SectionHeading({ eyebrow, title, description, action }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function StatusPill({ children, type = "neutral" }) {
  return <span className={`status-pill status-${type}`}>{children}</span>;
}

function MetricCard({ label, value, detail, accent = "blue" }) {
  return (
    <article className="metric-card">
      <div className="metric-topline">
        <span className={`metric-accent accent-${accent}`} />
        <span className="metric-label">{label}</span>
      </div>
      <div className="metric-value">{value}</div>
      {detail && <div className="metric-detail">{detail}</div>}
    </article>
  );
}

function App() {
  const [page, setPage] = useState("overview");
  const [location, setLocation] = useState(null);
  const [accidents, setAccidents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [apiStatus, setApiStatus] = useState("connecting");
  const [contactForm, setContactForm] = useState({
    name: "",
    relationship: "",
    phone: ""
  });
  const [contactMessage, setContactMessage] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  async function refreshDashboard() {
    try {
      const [locationResponse, accidentResponse, contactResponse] =
        await Promise.all([
          fetch(`${API_URL}/api/telemetry/latest`),
          fetch(`${API_URL}/api/accidents`),
          fetch(`${API_URL}/api/contacts`)
        ]);

      if (
        !locationResponse.ok ||
        !accidentResponse.ok ||
        !contactResponse.ok
      ) {
        throw new Error("API request failed");
      }

      const [locationData, accidentData, contactData] =
        await Promise.all([
          locationResponse.json(),
          accidentResponse.json(),
          contactResponse.json()
        ]);

      setLocation(locationData.location ?? null);
      setAccidents(accidentData.accidents ?? []);
      setContacts(contactData.contacts ?? []);
      setApiStatus("online");
    } catch {
      setApiStatus("offline");
    }
  }

  useEffect(() => {
    refreshDashboard();

    const timer = setInterval(refreshDashboard, 2000);
    return () => clearInterval(timer);
  }, []);

  const telemetryTime = location?.updatedAt
    ? new Date(location.updatedAt).getTime()
    : 0;

  const telemetryFresh =
    telemetryTime > 0 &&
    Date.now() - telemetryTime < 10000;

  const gpsReady =
    telemetryFresh &&
    location?.gpsFix === true;

  const imuReady =
    telemetryFresh &&
    location?.imuReady === true;

  const rolloverCandidate =
    location?.eventType === "ROLLOVER_CANDIDATE";

  async function handleContactSubmit(event) {
    event.preventDefault();
    setSavingContact(true);
    setContactMessage("");

    try {
      const response = await fetch(`${API_URL}/api/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not save contact.");
      }

      setContactForm({
        name: "",
        relationship: "",
        phone: ""
      });

      setContactMessage("Emergency contact added.");
      await refreshDashboard();
    } catch (error) {
      setContactMessage(error.message);
    } finally {
      setSavingContact(false);
    }
  }

  async function deleteContact(id) {
    const confirmed = window.confirm(
      "Remove this emergency contact?"
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `${API_URL}/api/contacts/${id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Could not remove contact.");
      }

      setContactMessage("Emergency contact removed.");
      await refreshDashboard();
    } catch (error) {
      setContactMessage(error.message);
    }
  }

  const headerStatus =
    apiStatus === "offline"
      ? "Backend offline"
      : !telemetryFresh
        ? "Waiting for device"
        : rolloverCandidate
          ? "Rollover candidate"
          : "Telemetry active";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">R</div>
          <div>
            <div className="brand-name">ResQLink</div>
            <div className="brand-caption">VEHICLE SAFETY SYSTEM</div>
          </div>
        </div>

        <div className="sidebar-section-label">MONITORING</div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.id === "accidents" && accidents.length > 0 && (
                <span className="nav-count">{accidents.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-device-icon">ESP32</div>
          <div className="sidebar-device-name">ResQLink Unit 01</div>
          <div className="sidebar-device-id">
            {location?.deviceId ?? "Waiting for device"}
          </div>
          <StatusPill type={telemetryFresh ? "success" : "neutral"}>
            {telemetryFresh ? "Telemetry active" : "No recent telemetry"}
          </StatusPill>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="topbar-kicker">RESQLINK / MONITOR</div>
            <h1>{NAV_ITEMS.find((item) => item.id === page)?.label}</h1>
          </div>

          <div className="topbar-status">
            <span
              className={`connection-dot ${
                apiStatus === "online" ? "connected" : ""
              }`}
            />
            <span>{apiStatus === "online" ? "API connected" : headerStatus}</span>
            <span className="topbar-divider" />
            <span className="topbar-device">
              {location?.vehicleNumber ?? "RESQ-VEHICLE-01"}
            </span>
          </div>
        </header>

        <div className="content-area">
          <div className="prototype-notice">
            <strong>Prototype mode</strong>
            <span>
              IMU tilt events are experimental rollover candidates, not
              confirmed real-world accidents. GSM calling/SMS is not
              integrated yet.
            </span>
          </div>

          {page === "overview" && (
            <>
              <div className="welcome-row">
                <div>
                  <h2>Vehicle overview</h2>
                  <p>
                    Live status from your ESP32, GPS and motion sensor.
                  </p>
                </div>
                <StatusPill type={rolloverCandidate ? "danger" : "success"}>
                  {rolloverCandidate
                    ? "Candidate event active"
                    : "Monitoring"}
                </StatusPill>
              </div>

              <div className="metrics-grid">
                <MetricCard
                  label="GPS POSITION"
                  value={gpsReady ? "FIX ACQUIRED" : "NO FIX"}
                  detail={
                    gpsReady
                      ? `${location.satellites} satellites`
                      : "Waiting for valid GPS"
                  }
                  accent="blue"
                />
                <MetricCard
                  label="MOTION SENSOR"
                  value={imuReady ? "ONLINE" : "NOT RECENT"}
                  detail={
                    location?.tiltDeg != null
                      ? `Tilt ${location.tiltDeg.toFixed(1)}°`
                      : "Calibrating or waiting"
                  }
                  accent="teal"
                />
                <MetricCard
                  label="VEHICLE SPEED"
                  value={
                    gpsReady && Number.isFinite(location?.speedKmph)
                      ? `${location.speedKmph.toFixed(1)}`
                      : "--"
                  }
                  detail="Kilometres per hour"
                  accent="violet"
                />
                <MetricCard
                  label="CANDIDATE EVENTS"
                  value={accidents.length}
                  detail="Stored in MongoDB"
                  accent={accidents.length ? "orange" : "blue"}
                />
              </div>

              {rolloverCandidate && (
                <div className="alert-banner">
                  <span className="alert-symbol">!</span>
                  <div>
                    <strong>Rollover candidate detected</strong>
                    <p>
                      The IMU tilt threshold has been crossed. This may be
                      a controlled bench test; verify the physical situation.
                    </p>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => setPage("accidents")}
                  >
                    View event
                  </button>
                </div>
              )}

              <section className="panel">
                <SectionHeading
                  eyebrow="LIVE TELEMETRY"
                  title="Vehicle location"
                  description="Latest coordinates received by the ResQLink API."
                  action={
                    <button
                      className="text-button"
                      onClick={() => setPage("tracking")}
                    >
                      Full tracking →
                    </button>
                  }
                />

                <VehicleMap location={location} />

                <div className="location-summary">
                  <div>
                    <span>LATITUDE</span>
                    <strong>{coordinate(location?.latitude)}</strong>
                  </div>
                  <div>
                    <span>LONGITUDE</span>
                    <strong>{coordinate(location?.longitude)}</strong>
                  </div>
                  <div>
                    <span>LAST UPDATE</span>
                    <strong>{formatTimestamp(location?.updatedAt)}</strong>
                  </div>
                </div>
              </section>

              <section className="panel">
                <SectionHeading
                  eyebrow="EVENT TIMELINE"
                  title="Recent candidate events"
                  description="Events recorded and persisted in MongoDB."
                  action={
                    <button
                      className="text-button"
                      onClick={() => setPage("accidents")}
                    >
                      View all →
                    </button>
                  }
                />

                <EventTable accidents={accidents.slice(0, 5)} />
              </section>
            </>
          )}

          {page === "tracking" && (
            <>
              <SectionHeading
                eyebrow="GPS TELEMETRY"
                title="Live vehicle tracking"
                description="Coordinates and sensor readings from your connected ESP32."
                action={
                  <a
                    className="secondary-button link-button"
                    href={
                      gpsReady
                        ? `https://www.google.com/maps?q=${location.latitude},${location.longitude}`
                        : undefined
                    }
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      if (!gpsReady) e.preventDefault();
                    }}
                  >
                    Open Google Maps ↗
                  </a>
                }
              />

              <section className="panel">
                <VehicleMap location={location} large />
                <div className="location-summary">
                  <div>
                    <span>VEHICLE ID</span>
                    <strong>{location?.vehicleNumber ?? "RESQ-VEHICLE-01"}</strong>
                  </div>
                  <div>
                    <span>LATITUDE</span>
                    <strong>{coordinate(location?.latitude)}</strong>
                  </div>
                  <div>
                    <span>LONGITUDE</span>
                    <strong>{coordinate(location?.longitude)}</strong>
                  </div>
                </div>
              </section>

              <section className="panel">
                <SectionHeading
                  eyebrow="DEVICE TELEMETRY"
                  title="GPS details"
                  description="Latest available location measurements."
                />

                <div className="details-grid">
                  <MetricCard
                    label="GPS FIX"
                    value={location?.gpsFix ? "VALID" : "UNAVAILABLE"}
                    detail={location?.gpsFix ? "Coordinates available" : "Waiting for fix"}
                  />
                  <MetricCard
                    label="SPEED"
                    value={valueWithUnit(location?.speedKmph, " km/h")}
                  />
                  <MetricCard
                    label="SATELLITES"
                    value={location?.satellites ?? "--"}
                  />
                  <MetricCard
                    label="LAST UPDATE"
                    value={formatTime(location?.updatedAt)}
                    detail={formatDate(location?.updatedAt)}
                  />
                </div>
              </section>
            </>
          )}

          {page === "accidents" && (
            <>
              <SectionHeading
                eyebrow="EVENT MANAGEMENT"
                title="Accident & rollover logs"
                description="Recorded candidate events from the connected device."
              />

              <div className="metrics-grid two-columns">
                <MetricCard
                  label="TOTAL LOGGED EVENTS"
                  value={accidents.length}
                  detail="Stored in MongoDB database"
                  accent="orange"
                />
                <MetricCard
                  label="CURRENT SENSOR STATE"
                  value={rolloverCandidate ? "CANDIDATE ACTIVE" : "NORMAL"}
                  detail="Based on the latest ESP32 telemetry"
                  accent={rolloverCandidate ? "orange" : "teal"}
                />
              </div>

              <section className="panel">
                <EventTable accidents={accidents} />
              </section>
            </>
          )}

          {page === "contacts" && (
            <>
              <SectionHeading
                eyebrow="EMERGENCY DIRECTORY"
                title="Emergency contacts"
                description="Manage the contacts intended to receive alerts when GSM integration is added."
              />

              <div className="contacts-layout">
                <section className="panel contact-form-panel">
                  <SectionHeading
                    title="Add a contact"
                    description="Contact details are stored securely in MongoDB."
                  />

                  <form
                    className="contact-form"
                    onSubmit={handleContactSubmit}
                  >
                    <label>
                      Contact name
                      <input
                        required
                        minLength={2}
                        maxLength={80}
                        value={contactForm.name}
                        onChange={(event) =>
                          setContactForm({
                            ...contactForm,
                            name: event.target.value
                          })
                        }
                        placeholder="Enter full name"
                      />
                    </label>

                    <label>
                      Relationship
                      <input
                        value={contactForm.relationship}
                        onChange={(event) =>
                          setContactForm({
                            ...contactForm,
                            relationship: event.target.value
                          })
                        }
                        placeholder="e.g. Family, friend"
                      />
                    </label>

                    <label>
                      Phone number
                      <input
                        required
                        type="tel"
                        minLength={7}
                        maxLength={20}
                        value={contactForm.phone}
                        onChange={(event) =>
                          setContactForm({
                            ...contactForm,
                            phone: event.target.value
                          })
                        }
                        placeholder="Include country code if needed"
                      />
                    </label>

                    <button
                      className="primary-button"
                      type="submit"
                      disabled={savingContact}
                    >
                      {savingContact ? "Saving..." : "Add emergency contact"}
                    </button>

                    {contactMessage && (
                      <p className="form-message">{contactMessage}</p>
                    )}
                  </form>
                </section>

                <section className="panel">
                  <SectionHeading
                    title={`Saved contacts (${contacts.length})`}
                    description="Persistent records stored in MongoDB."
                  />

                  {contacts.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">♧</div>
                      <strong>No emergency contacts yet</strong>
                      <p>Add a contact using the form.</p>
                    </div>
                  ) : (
                    <div className="contact-list">
                      {contacts.map((contact) => (
                        <article className="contact-item" key={contact.id}>
                          <div className="contact-avatar">
                            {contact.name.charAt(0).toUpperCase()}
                          </div>

                          <div className="contact-main">
                            <strong>{contact.name}</strong>
                            <span>{contact.relationship}</span>
                            <span>{contact.phone}</span>
                          </div>

                          <button
                            className="danger-text-button"
                            onClick={() => deleteContact(contact.id)}
                          >
                            Remove
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}

          {page === "hardware" && (
            <>
              <SectionHeading
                eyebrow="DEVICE DIAGNOSTICS"
                title="Hardware status"
                description="Status reported by the ESP32 telemetry stream."
              />

              <div className="hardware-grid">
                <HardwareCard
                  name="ESP32"
                  detail={telemetryFresh ? "Recent telemetry received" : "No recent telemetry"}
                  status={telemetryFresh ? "Online" : "Waiting"}
                  type={telemetryFresh ? "success" : "neutral"}
                  code={location?.deviceId ?? "Device not seen"}
                />
                <HardwareCard
                  name="NEO-6M GPS"
                  detail={gpsReady ? "Valid location fix reported" : "GPS fix unavailable"}
                  status={gpsReady ? "GPS fix" : "Waiting"}
                  type={gpsReady ? "success" : "warning"}
                  code={
                    gpsReady
                      ? `${coordinate(location.latitude)}, ${coordinate(location.longitude)}`
                      : "No valid coordinates"
                  }
                />
                <HardwareCard
                  name="MPU6500 / compatible IMU"
                  detail={
                    imuReady
                      ? "IMU readings reported by firmware"
                      : "No recent IMU status"
                  }
                  status={imuReady ? "Telemetry active" : "Waiting"}
                  type={imuReady ? "success" : "neutral"}
                  code={
                    location?.tiltDeg != null
                      ? `Tilt: ${location.tiltDeg.toFixed(1)}°`
                      : "Calibrating / awaiting telemetry"
                  }
                />
                <HardwareCard
                  name="SIM900A GSM"
                  detail="UART, network, SMS and call integration pending"
                  status="Not verified"
                  type="warning"
                  code="AT response not confirmed"
                />
                <HardwareCard
                  name="Express API"
                  detail={apiStatus === "online" ? "Dashboard API responding" : "API unreachable"}
                  status={apiStatus === "online" ? "Online" : "Offline"}
                  type={apiStatus === "online" ? "success" : "danger"}
                  code="Port 5001"
                />
                <HardwareCard
                  name="MongoDB Database"
                  detail={apiStatus === "online" ? "Persistent telemetry, events & contacts" : "Database status pending"}
                  status={apiStatus === "online" ? "Connected" : "Unknown"}
                  type={apiStatus === "online" ? "success" : "neutral"}
                  code="resqsphere"
                />
                <HardwareCard
                  name="Edge AI"
                  detail="Random Forest training and on-device deployment not integrated"
                  status="Planned"
                  type="neutral"
                  code="Future milestone"
                />
              </div>

              <section className="panel">
                <SectionHeading
                  title="Latest IMU readings"
                  description="Live sensor measurements in the server's latest telemetry record."
                />

                <div className="details-grid">
                  <MetricCard label="ACCEL X" value={valueWithUnit(location?.ax, " m/s²")} />
                  <MetricCard label="ACCEL Y" value={valueWithUnit(location?.ay, " m/s²")} />
                  <MetricCard label="ACCEL Z" value={valueWithUnit(location?.az, " m/s²")} />
                  <MetricCard label="GYRO X" value={valueWithUnit(location?.gx, " °/s")} />
                  <MetricCard label="GYRO Y" value={valueWithUnit(location?.gy, " °/s")} />
                  <MetricCard label="GYRO Z" value={valueWithUnit(location?.gz, " °/s")} />
                  <MetricCard
                    label="ACCEL MAGNITUDE"
                    value={valueWithUnit(location?.accelMagnitude, " m/s²")}
                  />
                  <MetricCard
                    label="TILT ANGLE"
                    value={valueWithUnit(location?.tiltDeg, "°")}
                  />
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function EventTable({ accidents }) {
  if (accidents.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">✓</div>
        <strong>No candidate events recorded</strong>
        <p>Candidate events will appear here when reported by the ESP32.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Vehicle</th>
            <th>Event</th>
            <th>GPS location</th>
            <th>Tilt</th>
            <th>Status</th>
            <th>Voice Call</th>
          </tr>
        </thead>
        <tbody>
          {accidents.map((event) => (
            <tr key={event.id}>
              <td>
                <strong>{formatTime(event.timestamp)}</strong>
                <span className="table-subtext">
                  {formatDate(event.timestamp)}
                </span>
              </td>
              <td>{event.vehicleNumber}</td>
              <td>
                <StatusPill type="danger">{event.eventType}</StatusPill>
              </td>
              <td>
                {event.gpsFix &&
                Number.isFinite(event.latitude) &&
                Number.isFinite(event.longitude) ? (
                  <a
                    href={`https://www.google.com/maps?q=${event.latitude},${event.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {coordinate(event.latitude)}, {coordinate(event.longitude)}
                  </a>
                ) : (
                  "--"
                )}
              </td>
              <td>
                {Number.isFinite(event.tiltDeg)
                  ? `${event.tiltDeg.toFixed(1)}°`
                  : "--"}
              </td>
              <td>
                <StatusPill type="warning">{event.status}</StatusPill>
              </td>
              <td>
                {event.callSid ? (
                  <div>
                    <StatusPill
                      type={
                        event.callStatus === "FAILED"
                          ? "danger"
                          : event.callStatus === "SIMULATED"
                            ? "neutral"
                            : "success"
                      }
                    >
                      {event.callStatus === "SIMULATED"
                        ? "Simulated Call"
                        : event.callStatus === "ALERT_DISPATCHED"
                          ? "Calling"
                          : event.callStatus}
                    </StatusPill>
                    {event.emergencyContactCalled?.phone && (
                      <span className="table-subtext">
                        {event.emergencyContactCalled.name ? `${event.emergencyContactCalled.name}: ` : ""}
                        {event.emergencyContactCalled.phone}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="table-subtext">No call</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HardwareCard({ name, detail, status, type, code }) {
  return (
    <article className="hardware-card">
      <div className="hardware-card-top">
        <div className="hardware-symbol">⌘</div>
        <StatusPill type={type}>{status}</StatusPill>
      </div>
      <h3>{name}</h3>
      <p>{detail}</p>
      <div className="hardware-code">{code}</div>
    </article>
  );
}

export default App;
