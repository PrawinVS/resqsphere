# ResQSphere — Smart Vehicle Safety & Telemetry Platform

ResQSphere (ResQLink) is an IoT-enabled vehicle monitoring and accident candidate detection system. Telemetry streams from an on-board ESP32 unit (equipped with GPS and IMU sensors) to an Express.js backend and is persisted in **MongoDB**, with live visualization on a React + Vite dashboard.

---

## Architecture Overview

```
                      +-------------------+
                      |   ESP32 Device    |
                      | (GPS + IMU Sensor)|
                      +---------+---------+
                                |
                     HTTP POST  | Telemetry
                                v
               +---------------------------------+
               |        Express.js Backend       |
               |         (Port 5000)             |
               +----------------+----------------+
                                |
                     Mongoose   | Driver
                                v
               +---------------------------------+
               |        MongoDB Database         |
               |        (Port 27017)             |
               |  - devices                      |
               |  - telemetries (timeseries)     |
               |  - accidentlogs                 |
               |  - contacts                     |
               +----------------+----------------+
                                ^
                     REST API   | Polling / State
                                |
               +----------------+----------------+
               |      React Vite Dashboard       |
               |         (Port 5173)             |
               +---------------------------------+
```

---

## MongoDB Collections & Schema

1. **`devices`** ([models/Device.js](server/models/Device.js))
   - Stores the digital twin / live telemetry state of each vehicle unit.
   - Fields: `deviceId`, `vehicleNumber`, `gpsFix`, `latitude`, `longitude`, `satellites`, `speedKmph`, `imuReady`, `ax`, `ay`, `az`, `gx`, `gy`, `gz`, `accelMagnitude`, `tiltDeg`, `eventType`, `previousEventType`, `updatedAt`.

2. **`telemetries`** ([models/Telemetry.js](server/models/Telemetry.js))
   - Persistent historical time-series log of all telemetry points.
   - Indexed on `{ deviceId: 1, timestamp: -1 }`.

3. **`accidentlogs`** ([models/AccidentLog.js](server/models/AccidentLog.js))
   - Stores rollover candidate events and crash alerts triggered when sensor thresholds are crossed.
   - Fields: `deviceId`, `vehicleNumber`, `eventType`, `status`, `timestamp`, `latitude`, `longitude`, `gpsFix`, `tiltDeg`, `note`.

4. **`contacts`** ([models/Contact.js](server/models/Contact.js))
   - Stores emergency contacts with validation.
   - Fields: `name`, `relationship`, `phone`, `createdAt`.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check & MongoDB connection status |
| `POST` | `/api/telemetry/location` | Ingest live GPS + IMU telemetry from ESP32 |
| `GET` | `/api/telemetry/latest` | Fetch latest live location for the dashboard |
| `GET` | `/api/telemetry/history` | Retrieve historical telemetry points |
| `GET` | `/api/accidents` | Retrieve candidate accident & rollover events |
| `GET` | `/api/contacts` | Retrieve emergency contacts list |
| `POST` | `/api/contacts` | Add a new emergency contact |
| `DELETE` | `/api/contacts/:id` | Remove an emergency contact |

---

## Getting Started

### 1. Prerequisites
- **Node.js** (v18+ recommended)
- **MongoDB** running locally on port `27017` (e.g. `brew services start mongodb-community`)

### 2. Backend Setup (`resqsphere/server`)
```bash
cd resqsphere/server

# Install dependencies (express, cors, dotenv, mongoose)
npm install

# Seed starter contacts and sample telemetry into MongoDB
npm run seed

# Run automated integration tests
npm test

# Start the server (runs on http://localhost:5000)
npm run dev
```

### 3. Frontend Setup (`resqsphere/client`)
```bash
cd resqsphere/client

# Install dependencies
npm install

# Start Vite development server (runs on http://localhost:5173)
npm run dev
```

### 4. Telemetry Stream Simulator (Optional)
If you don't have the physical ESP32 connected, you can run the built-in simulator to test real-time map tracking and alerts:

```bash
cd resqsphere/server

# Simulate normal driving movement
npm run simulate

# Simulate rollover candidate event (triggers tilt alert after 5s)
npm run simulate:rollover
```

