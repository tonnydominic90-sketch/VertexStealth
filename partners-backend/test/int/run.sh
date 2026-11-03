#!/bin/bash
cd "$(dirname "$0")"
./up.sh && timeout 150 python3 test_int.py; rc=$?
./down.sh; exit $rc
