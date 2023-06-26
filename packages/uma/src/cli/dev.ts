import fork from "./fork";

export function dev(){
  const child = fork({
    scriptPath: require.resolve("../../bin/forkedDev")
  });

  process.on('SIGINT', ()=>{
    child.kill('SIGINT');
    process.exit(0);
  });
  process.on('SIGTERM', ()=>{
    child.kill("SIGTERM");
    process.exit(1);
  });
}