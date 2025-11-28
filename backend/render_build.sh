#!/usr/bin/env bash
# Render build script for backend

set -o errexit

pip install --upgrade pip
pip install -r requirements.txt
