# Marzban Service

## Implement marzban service
- marzban acts as our wrapper around xray, we need to add users to the marzban panel and get configs from it. 
- I need an standalone service that makes it easy to interact with marzban api and implements all things from the api. 
- You can read more about the marzban docs @docs/internal/marzban_api.json
- The service must be singleton and intialized once for the lifetime of the application
- make user of Test Driven Development