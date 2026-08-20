if (process.argv.includes("--health")) {
  console.log("api healthy");
  process.exit(0);
}

console.log("api ready");
setTimeout(() => {}, 10000);
