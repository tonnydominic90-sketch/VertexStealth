#!/bin/bash
pkill -f "[/]tmp/postgrest" 2>/dev/null; pkill -f "[s]upport.mjs" 2>/dev/null; pkill -f "[s]erve_functions" 2>/dev/null; pkill -f "[s]cripts/serve.js" 2>/dev/null; sleep 1; exit 0
