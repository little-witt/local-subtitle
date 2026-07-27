#!/usr/bin/env sh
set -eu

export OLLAMA_ORIGINS="${OLLAMA_ORIGINS:-chrome-extension://*,http://localhost,http://127.0.0.1}"
export OLLAMA_MODELS="${OLLAMA_MODELS:-$HOME/.ollama/models}"

exec ollama serve
