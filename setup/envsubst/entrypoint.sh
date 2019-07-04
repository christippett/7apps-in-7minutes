#!/bin/sh
mv $1 $1.bak
envsubst < $1.bak > $1
