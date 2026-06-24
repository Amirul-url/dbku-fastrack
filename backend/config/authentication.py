from rest_framework_simplejwt.authentication import JWTAuthentication


class QueryParamJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        if self.get_header(request) is not None:
            return super().authenticate(request)

        raw_token = request.query_params.get("access_token")
        if not raw_token:
            return None

        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token
