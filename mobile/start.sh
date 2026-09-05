#!/usr/bin/env bash
# Starts Metro so a phone on the same Wi-Fi can reach it.
#
# Under WSL, Expo often advertises "localhost", which a phone cannot dial. The
# app also derives the API server address from this same host, so getting it
# wrong breaks both the bundle download and every server call. We pin it to the
# machine's LAN address explicitly.
set -euo pipefail

LAN="${SMRUTI_HOST:-$(hostname -I | awk '{print $1}')}"

if [ -z "$LAN" ]; then
  echo "Could not work out this machine's LAN address." >&2
  echo "Set it by hand:  SMRUTI_HOST=192.168.1.23 ./start.sh" >&2
  exit 1
fi

export REACT_NATIVE_PACKAGER_HOSTNAME="$LAN"

echo "Metro host   : $LAN"
echo "Phone dials  : exp://$LAN:8081"
echo "App will call: http://$LAN:8787"
echo
echo "Start the server too, in another terminal:  cd ../server && npm start"
echo

exec npx expo start --lan "$@"
