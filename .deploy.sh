#!/bin/bash
set -e

npm run build
npm run db:push
