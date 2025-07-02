# UniFi Roomie Portal

A minimal Node.js app to let limited users manage VLANs on a UniFi Controller. Designed for easy deployment as a TrueNAS SCALE custom app.

---

## Features

- Password-protected login for limited access  
- List existing VLANs  
- Add new VLANs  
- Uses UniFi Controller API (self-signed SSL supported)  

---

## Requirements

- UniFi Controller accessible via API (usually on port 8443)  
- Docker installed (for building and running container)  
- TrueNAS SCALE or any Kubernetes/Docker environment  

---

## Setup

1. Clone this repo:  
   ```bash
   git clone https://github.com/yourusername/unifi-roomie-portal.git
   cd unifi-roomie-portal
