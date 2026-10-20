#!/bin/bash
# Prepara el servidor para las conversiones DOCX → PDF/RTF y PDF → DOCX de Gallardito Converter.
# Ejecutar en el servidor con: sudo bash instalar.sh
set -euo pipefail
cd "$(dirname "$0")"

apt-get install -y --no-install-recommends libreoffice-writer-nogui \
  fonts-crosextra-carlito fonts-crosextra-caladea fonts-liberation fonts-liberation2 \
  fonts-dejavu fonts-noto-core fonts-noto-color-emoji fonts-opensymbol python3-venv

# pdf2docx en un entorno aparte
mkdir -p /opt/gallardito
[ -d /opt/gallardito/venv ] || python3 -m venv /opt/gallardito/venv
/opt/gallardito/venv/bin/pip install -q --only-binary=:all: pdf2docx
install -m 644 -o root -g root pdf2docx_run.py /opt/gallardito/pdf2docx_run.py

# Usuario sin privilegios para LibreOffice
id lo-convert >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin lo-convert

# Sin acceso a la red para lo-convert (también hay que añadir la regla a /etc/iptables/rules.v4 y rules.v6)
iptables -C OUTPUT -m owner --uid-owner lo-convert -j REJECT 2>/dev/null || iptables -I OUTPUT 1 -m owner --uid-owner lo-convert -j REJECT
ip6tables -C OUTPUT -m owner --uid-owner lo-convert -j REJECT 2>/dev/null || ip6tables -I OUTPUT 1 -m owner --uid-owner lo-convert -j REJECT

# Carpeta de trabajo en RAM
install -m 644 tmpfiles-gallardito.conf /etc/tmpfiles.d/gallardito.conf
systemd-tmpfiles --create /etc/tmpfiles.d/gallardito.conf

# Script de conversión y permiso para que Apache lo lance como lo-convert
install -m 755 -o root -g root gallardito-convert /usr/local/bin/gallardito-convert
install -m 440 -o root -g root sudoers-gallardito /etc/sudoers.d/gallardito
visudo -c -q
echo "Listo."
