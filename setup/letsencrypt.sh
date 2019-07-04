gcloud container clusters get-credentials demo-cluster --zone australia-southeast1-b --project servian-app-demo

kubectl create --namespace istio-system secret tls istio-ingressgateway-certs \
    --key privkey.pem \
    --cert fullchain.pem


kubectl create clusterrolebinding chris-admin \
    --clusterrole=cluster-admin \
    --user=chris.tippett@servian.com
