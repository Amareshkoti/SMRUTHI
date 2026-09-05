#!/usr/bin/env bash
#
# Starts everything SMRUTI needs, with one command.
#
#   ./dev.sh              phone and laptop on the same Wi-Fi (or your hotspot)
#   ./dev.sh --mock       same, but no NVIDIA calls at all (offline demo)
#   ./dev.sh --tunnel     only if you have an ngrok account -- see below
#
# Stop everything with Ctrl-C.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOCK=0
TUNNEL=0
for arg in "$@"; do
  case "$arg" in
    --mock) MOCK=1 ;;
    --tunnel) TUNNEL=1 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# The address other devices reach us on. Ask the routing table which source
# address is used to reach the internet -- reading the first entry of
# `hostname -I` picks up docker bridges and gives a phone an unreachable IP.
lan_address() {
  ip route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -1
}

LAN="$(lan_address)"
if [ -z "$LAN" ]; then
  echo "Could not work out this machine's network address." >&2
  echo "Set it by hand:  SMRUTI_HOST=192.168.1.23 ./dev.sh" >&2
  exit 1
fi
LAN="${SMRUTI_HOST:-$LAN}"

cleanup() {
  echo
  echo "stopping..."
  pkill -f "tsx src/index.ts" 2>/dev/null
  pkill -f "expo start" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

echo "================================================================"
echo "  SMRUTI"
echo "================================================================"
echo "  this machine : $LAN"
echo "  mode         : $([ $MOCK = 1 ] && echo 'offline (no NVIDIA calls)' || echo 'live')"
echo

# --- tunnel mode: refuse rather than half-work -------------------------------
if [ $TUNNEL = 1 ]; then
  if [ -z "${NGROK_AUTHTOKEN:-}" ]; then
    cat >&2 <<'MSG'
Tunnel mode cannot work here, and would fail confusingly if it started.

Expo's tunnel forwards Metro (8081) only. The API server (8787) is not
tunnelled, so the app would download and open, then fail on every "Add
report" and every question -- a worse symptom than not starting at all.
Tunnelling a second port needs an ngrok account.

Do this instead: connect this LAPTOP to your phone's hotspot as well.
The phone is already on it; once the laptop joins, both ports work at full
speed with no third party in the path.

  1. phone: turn on the hotspot
  2. laptop: connect to that hotspot
  3. re-run ./dev.sh   (the address is detected fresh each time)

If you do have an ngrok account, export NGROK_AUTHTOKEN and re-run.
MSG
    exit 1
  fi
  echo "  tunnel       : enabled (ngrok token found)"
fi

# --- warn when the laptop looks like it is on a different network ------------
case "$LAN" in
  172.17.133.*)
    echo "  NOTE: this is the office Wi-Fi. If your phone is on its own hotspot,"
    echo "        they are on DIFFERENT networks and Expo Go will report"
    echo "        \"failed to download remote update\". Connect this laptop to the"
    echo "        hotspot too, then re-run."
    echo
    ;;
esac

# --- server -------------------------------------------------------------------
pkill -f "tsx src/index.ts" 2>/dev/null
pkill -f "expo start" 2>/dev/null
sleep 1

echo "starting API server..."
cd "$ROOT/server"
if [ $MOCK = 1 ]; then
  SMRUTI_MOCK=1 nohup npx tsx src/index.ts > /tmp/smruti-server.log 2>&1 &
else
  nohup npx tsx src/index.ts > /tmp/smruti-server.log 2>&1 &
fi

for i in $(seq 1 40); do
  curl -s -m 2 -o /dev/null "http://127.0.0.1:8787/api/health" 2>/dev/null && break
  sleep 1
done

if ! curl -s -m 3 -o /dev/null "http://127.0.0.1:8787/api/health" 2>/dev/null; then
  echo "The API server did not start. Last lines of its log:" >&2
  tail -15 /tmp/smruti-server.log >&2
  exit 1
fi
echo "  API ready on http://$LAN:8787"
echo

# --- metro --------------------------------------------------------------------
echo "starting Metro..."
echo
cd "$ROOT/mobile"

cat <<EOF
================================================================
  On your phone, open Expo Go and either scan the QR below,
  or tap "Enter URL manually" and type:

      exp://$LAN:8081

  Phone and laptop must be on the SAME network.
================================================================

EOF

export REACT_NATIVE_PACKAGER_HOSTNAME="$LAN"
if [ $TUNNEL = 1 ]; then
  exec npx expo start --tunnel --port 8081
else
  exec npx expo start --lan --port 8081
fi
