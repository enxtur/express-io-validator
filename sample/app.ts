import bodyParser from "body-parser";
import express from "express";
import * as t from "io-ts";
import { Validator } from "../src";

const { validateBody } = Validator((error) => {
  return {
    errors: error.flatMap((err) => {
      return err.context.map((c) => ({
        key: c.key,
        expected: c.type?.name,
        actual: c.actual ?? "undefined",
        message: "something went wrong",
      }));
    }),
  };
});

export const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const CODEC = t.type({
  name: t.string,
  age: t.number,
  info: t.type({
    gender: t.string,
    email: t.string,
  }),
});

app.post(
  "/users",
  validateBody(CODEC, (req, res) => {
    res.json({
      name: req.body.name,
      age: req.body.age,
      info: {
        gender: req.body.info.gender,
        email: req.body.info.email,
      },
    });
  })
);

const CODEC2 = t.union([
  t.type({
    name: t.string,
    age: t.number,
  }),
  t.type({
    info: t.type({
      gender: t.string,
      email: t.string,
    }),
  }),
]);

app.post(
  "/users2",
  validateBody(CODEC2, (req, res) => {
    res.json(req.body);
  })
);
