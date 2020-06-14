#!/bin/sh
# Create manual SSL certificate for Cloud Run on GKE
gcloud container clusters get-credentials demo-cluster --zone australia-southeast1-b --project servian-app-demo
kubectl create --namespace istio-system secret tls istio-ingressgateway-certs \
    --key privkey.pem \
    --cert fullchain.pem
