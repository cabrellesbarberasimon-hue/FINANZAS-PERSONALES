import next from "eslint-config-next";

const config = [
  { ignores: ["src/generated/**", ".next/**", "node_modules/**"] },
  ...next,
];

export default config;
