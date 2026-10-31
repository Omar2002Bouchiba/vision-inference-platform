# Architecture and Design Patterns

## Layered API

Routes define the HTTP endpoints, middleware handles authentication/authorization and request checks, service modules handle work such as credit charging and inference-service calls, and Sequelize models represent persisted data. This separation keeps HTTP details out of the worker and Python code.

## Singleton connections

`src/config/database.ts` exports one Sequelize connection instance, and `src/queue/inference-queue.ts` exports one Bull queue instance per Node process. This avoids accidentally creating new connection pools or queues for each request.

## Producer-consumer with Bull

The Express API is the producer: it validates a request, reserves credit in a database transaction, saves a PENDING job, and adds it to Redis through Bull. A separate Node worker is the consumer. It updates the job status, calls the Python service, and saves the result. This lets an API response return quickly while video work continues in the background.

## Adapter for Python inference

`src/services/inference-client.ts` is an adapter around the Python service's HTTP interface. The API and worker use typed methods (`probe`, `infer`, `renderFrame`) instead of duplicating HTTP details. The Python service can be replaced without changing the API route definitions or queue payload format.

## Transactional credit ledger

Credit balance changes and corresponding ledger entries are written together in PostgreSQL transactions. Row locks prevent two simultaneous requests from spending the same balance. The ledger also records upload charges, inference reservations, refunds on queue failure, and admin top-ups.
