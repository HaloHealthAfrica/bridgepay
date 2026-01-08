import "dotenv/config";
import http from "http";
import { app } from "./app";
import { initializeSocket } from "./services/socket.service";

const port = Number(process.env.PORT || 3000);

const server = http.createServer(app);
initializeSocket(server);

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Bridge backend listening on :${port}`);
});




