import bodyParser from "body-parser";
import express from "express";
import * as t from "io-ts";
import { Validator } from "../src";

const { validateBody, validateQuery, validateParams } = Validator((error) => {
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

const BODY_CODEC = t.type({
  name: t.string,
  age: t.number,
  info: t.type({
    email: t.string,
    gender: t.union([t.literal("male"), t.literal("female")]),
  }),
});

app.post(
  "/body",
  validateBody(BODY_CODEC, (req, res) => {
    res.json({
      name: req.body.name,
      age: req.body.age,
      info: {
        email: req.body.info.email,
        gender: req.body.info.gender,
      },
    });
  })
);

const NUMBER_FROM_STRING = new t.Type<number, string, unknown>(
  "NUMBER_FROM_STRING",
  (input: unknown): input is number => {
    return t.string.is(input) && !isNaN(Number(input));
  },
  (input, context) => {
    if (typeof input !== "string") {
      return t.failure(input, context, "Expected a number as a string");
    }

    const output = Number(input);
    if (isNaN(output)) {
      return t.failure(input, context, "Expected a number");
    }

    return t.success(output);
  },
  (input) => `${input}`
);

const QUERY_CODEC = t.type({
  name: t.string,
  age: NUMBER_FROM_STRING,
});

app.get(
  "/query",
  ...validateQuery(QUERY_CODEC, (req, res) => {
    console.log({
      locals: res.locals,
      typedQuery: res.locals.typedQuery,
    });
    res.json({
      name: res.locals.typedQuery.name,
      age: res.locals.typedQuery.age,
    });
  })
);

const PARAMS_CODEC = t.type({
  id: NUMBER_FROM_STRING,
});

app.get(
  "/params/:id",
  ...validateParams(PARAMS_CODEC, (req, res) => {
    res.json({
      id: req.params.id,
    });
  })
);