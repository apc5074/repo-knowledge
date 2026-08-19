import { Router } from "express";

export const usersRouter = Router();

usersRouter.get("/users", (_request, response) => {
  response.json([]);
});
