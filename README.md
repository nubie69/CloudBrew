# Coffee Management System (Expo + MongoDB)

A role-based Coffee POS and operations app built with Expo (React Native) for three staff roles:
- Cashier
- Barista
- Admin

## Features

### Cashier
- Encode customer orders in POS form.
- Press **Proceed** to queue orders for barista.
- Monitor status updates: `pending` -> `in-progress` -> `completed`.

### Barista
- Receives in-app real-time notifications for new orders.
- Sees order details (drink, size, add-ons).
- Sees recipe ingredients and opens guided preparation steps.
- Marks orders as completed.

### Admin
- Audits activity logs (orders, status changes, staff actions, timestamps).
- Edits recipes, ingredients, and preparation steps.
- Manages staff records and role assignment.
- Generates an operations report snapshot.

## Project Structure

- App.js
- src/
  - screens/
    - LoginScreen.js
    - CashierScreen.js
    - BaristaScreen.js
    - AdminScreen.js
  - components/
    - OrderCard.js
    - RecipeGuide.js
    - StatusBadge.js
  - services/
    - api.js
    - auth.js
    - notifications.js
  - navigation/
    - AppNavigator.js
  - context/
    - UserContext.js
  - assets/
    - images/
    - styles/theme.js
  - utils/
    - helpers.js
- tests/
  - unit/
  - integration/

## Getting Started

1. Install dependencies:
   npm install

2. Create your environment file:
   copy .env.example .env

3. Update .env with your MongoDB URI:
   MONGODB_URI=your_mongodb_connection_string

4. Start the Mongo-backed API server:
   npm run server

5. In a second terminal, start the Expo app:
   npm run start

6. Open on device/simulator via Expo QR flow.

## API URL for Expo

- Default API URL is http://localhost:4000/api for web and iOS simulator.
- Android emulator uses http://10.0.2.2:4000/api automatically.
- You can override in .env:
  EXPO_PUBLIC_API_URL=http://your-machine-ip:4000/api

## MongoDB Backend

This project now includes an Express + MongoDB API in server/index.js.

Implemented endpoints:
- GET /api/health
- GET /api/bootstrap
- POST /api/auth/login
- POST /api/auth/forgot-password (admin)
- POST /api/auth/reset-password (admin)
- POST /api/auth/change-password (admin, authenticated)
- PUT /api/auth/recovery-email (admin, authenticated)
- POST /api/orders
- PATCH /api/orders/:orderId/status
- PUT /api/recipes/:drinkName
- DELETE /api/recipes/:drinkName
- GET /api/staff?page=1&pageSize=10&query=
- POST /api/staff
- PUT /api/staff/:staffId
- PATCH /api/staff/:staffId/active
- DELETE /api/staff/:staffId
- GET /api/logs?page=1&pageSize=20&query=
- POST /api/reports

Authentication and authorization:
- Login now returns `{ token, user }`.
- Login accepts `email + password` (role optional) and returns `user.role`.
- Pass the token as `Authorization: Bearer <token>` for all protected routes.
- Role guards are enforced on the backend:
  - `cashier` or `admin`: create orders
  - `barista` or `admin`: update order status
  - `admin`: recipes, staff, logs, reports, admin bootstrap datasets

Admin pagination/search endpoints:
- `GET /api/staff`: supports `page`, `pageSize`, and `query`.
- `GET /api/logs`: supports `page`, `pageSize`, and `query`.
- Response shape includes `items`, `total`, `page`, `pageSize`, and `totalPages`.

On first startup, the API seeds default staff and recipes into MongoDB.

Admin password recovery:
- Admin must first configure a recovery email in Admin Settings.
- Forgot/reset password uses `recoveryEmail` (not cashier/barista accounts).
- In local development, the API response includes a temporary reset code for testing.
- Admin can change their own password from the admin panel while logged in.
- Cashier and barista passwords are managed by admin only.

## Starter Login Accounts

- Admin: admin@cloudbrew.app
- Cashier: cashier@cloudbrew.app
- Barista: barista@cloudbrew.app

Starter passwords:
- Admin password comes from `ADMIN_BOOTSTRAP_PASSWORD` (default: `Admin9090!`).
- Cashier and barista starter passwords are seeded for development and can be changed by admin in the staff panel.

## Notes

- Keep your MongoDB credentials in .env only.
- For production real-time updates, replace src/services/notifications.js with WebSocket or push notifications.
