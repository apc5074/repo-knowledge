if (process.argv.includes("--health")) {
  console.log("worker healthy");
  process.exit(0);
}

console.log("worker ready");
setTimeout(() => {}, 10000);
