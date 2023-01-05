import * as core from "@actions/core";
import * as io from "@actions/io";
import * as exec from "@actions/exec";
import * as process from "process";
import * as cache from "@actions/cache";

const SELF_CI = process.env["FIREBUILD_ACTION_CI"] === "true"

// based on https://cristianadam.eu/20200113/speeding-up-c-plus-plus-github-actions-using-ccache/

const ppaKey = "" +
"-----BEGIN PGP PUBLIC KEY BLOCK-----\\n\\n" +
"mQINBGOU814BEAClejx2fIENh0LVO325EBM7Zpi0uzKBXiVQb7FzuAHjOl32Qd5h\\n" +
"zZi0BMWWGKUSl8XeAs9tazSLgDI/l0C4C/5XCsMmV6addzcXYnins+LqbIV92G32\\n" +
"HGqGwdpCIdzwgyCq47UVU7/BVKTXFs0E2vYuNI7Nd9GTaPUpPbNCt0dbwioq9AIv\\n" +
"q2vLXlJw+KygPGYAK6NKPjRU0YaxhB7zee6cJSCrbF3p00odUTBX2Rbtm/4e9bmP\\n" +
"NVB7bewd/LaGPewDL922wfH6TPfqf22AHtZztGrM2SFJnmhhyOm0G4WVpWDh8hKU\\n" +
"K6f/UXQt/PQvcStf6epDGJQ5lQLOciHyjWmkHfjBvsKyUVFMaMi4vpNZiPF5SHqU\\n" +
"yhANzhLjYMd32CwpSwTE2yeflaQJ6dcZcLnC0hPhFO0OLsiRgU3UneEqYE/RPQwi\\n" +
"OC0vQsZ6Y/Jpo7O9krzN/ut5kwZV5SFEgERo9DzOLyS+TQfrIwIMNLSyg9Kay+7E\\n" +
"UNcav42+74OSMLj7v+wFN9W0MLS7P+TmdkbXdLXBkXOHsFNSqiotQxDRSVZ7YXn3\\n" +
"O+nA61BJXtN46Xak9qvHXj9dPK7k7dMOTGEN3bz4hb3Bi7BKHJ/Xi4ppmJzP10aA\\n" +
"vrX54GDPj18Gck/BsKZR5ttepg2k2H//8N34O1GIRYg0TudBcFaSQboWlQARAQAB\\n" +
"tCBMYXVuY2hwYWQgUFBBIGZvciBGaXJlYnVpbGQgVGVhbYkCTgQTAQoAOBYhBOs4\\n" +
"ZGRY4wuLDwDC9A9LN3k6bsfsBQJjlPNeAhsDBQsJCAcCBhUKCQgLAgQWAgMBAh4B\\n" +
"AheAAAoJEA9LN3k6bsfsEJoP/22AkCf8sIGJCpxOyRI9AjHhGFQyRE1YjLR+hLnO\\n" +
"o9vZKlej7NbVp7QhM51el3o8b326Iz+1scxiui545TrPSnHTT3/2rsCghAH8QIsb\\n" +
"XG6yoBJqYHWdhAZRSjRWjTiNJWgyHSFNYXZ4I8eOUIb75YH2vPEatPuk3jlxPIgr\\n" +
"YUPYGDY6YORGzQBlsQyCbPJzzmt++13v3/cjFg+a16mX5lpmcI5W78Ynfhd0RaYA\\n" +
"PjSaei7Wp6mN8ZfM4x9XxY3QdzSszcBsgnTmR6+KyEViAz0b2tIZjO9Ic6+0oDVT\\n" +
"X936Jtiwdu/s0vIvhw1IFnD2EXtnrNSLiarYTuzOvpaXgGqYt/YgsRhbQqzzPzWF\\n" +
"3lYUGN95ciO2gG8CAf8ds8Jvrupe5fIdr+XxfvF7eVj69rgVaIV3A01ABm1ZWNYQ\\n" +
"amX/7X3v4bcmlyZaAzp4MWTi5Mkx8LMyqm4IsIIMZ7oYKn92FdlKOjycXgucQ//+\\n" +
"BV8MW4S283DuRd8Gu4a311GZpHkgzW3Mw8jXxlM3HDaU4rZnu6DFxUWOU+yPUURw\\n" +
"oLtb8TD/zJcuU6o0aDHszx60vhP60E1sRnVv4EZdA4VjjIeXKx01jqklDRUIlbXj\\n" +
"qZ5yhZVZlHQTX1jbH72GO50xQtfb/QGILsTf7w8vjiiBFR7Fo+e8Rg5zfBI4EIOE\\n" +
"6tC+\\n" +
"=4Qt3\\n" +
"-----END PGP PUBLIC KEY BLOCK-----\\n";


function getExecBashOutput(cmd : string) : Promise<exec.ExecOutput> {
  return exec.getExecOutput("bash", ["-c", cmd], {silent: true});
}

async function restore() : Promise<void> {
  const inputs = {
    primaryKey: core.getInput("key"),
    // https://github.com/actions/cache/blob/73cb7e04054996a98d39095c0b7821a73fb5b3ea/src/utils/actionUtils.ts#L56
    restoreKeys: core.getInput("restore-keys").split("\n").map(s => s.trim()).filter(x => x !== "")
  };

  const keyPrefix = "firebuild-";
  const primaryKey = inputs.primaryKey ? keyPrefix + inputs.primaryKey + "-" : keyPrefix;
  const restoreKeys = inputs.restoreKeys.map(k => keyPrefix + k + "-")
  const paths = [".cache/firebuild"];

  core.saveState("primaryKey", primaryKey);

  const restoredWith = await cache.restoreCache(paths, primaryKey, restoreKeys);
  if (restoredWith) {
    core.info(`Restored from cache key "${restoredWith}".`);
    if (SELF_CI) {
      core.setOutput("test-cache-hit", true)
    }
  } else {
    core.info("No cache found.");
    if (SELF_CI) {
      core.setOutput("test-cache-hit", false)
    }
  }
}

async function configure() : Promise<void> {
  const ghWorkSpace = process.env.GITHUB_WORKSPACE || "unreachable, make ncc happy";
  const maxSize = core.getInput('max-size');
  
  await execBashSudo(`sed -i 's/^max_cache_size = .*/max_cache_size = ${maxSize}/' /etc/firebuild.conf`);
  process.env["FIREBUILD_CACHE_DIR"] = `${ghWorkSpace}/.cache/firebuild`
  core.info("Firebuild config:");
  await execBash("cat /etc/firebuild.conf");
}

async function installFirebuildLinux() : Promise<void> {
  await execBashSudo("sh -c 'type curl 2> /dev/null > /dev/null || $(which eatmydata) apt-get install -y --no-install-recommends curl ca-certificates'");
  core.info("Verifying the Firebuild license.");
  // Does that work reliably with cloud action runners and in enterprise deployments?
  let isPublicRepo = false;
  try {
    isPublicRepo = ((await exec.exec(`curl -f -s -o /dev/null https://github.com/${process.env.GITHUB_REPOSITORY}`)) === 0);
  } catch (error) {
  }
  const actorSha256 = isPublicRepo ? "" : (await getExecBashOutput(`echo ${process.env.GITHUB_ACTOR} | sha256sum | cut -f1 -d" "`)).stdout;
  try {
    await exec.exec(`curl -f -s https://firebuild.com/firebuild-gh-app/query?user=${process.env.GITHUB_REPOSITORY_OWNER}&actor_sha256=${actorSha256}`);
    await execBashSudo("sh -c 'echo debconf firebuild/license-accepted select true | debconf-set-selections'");
    await execBashSudo(`sh -c 'add-apt-repository -y ppa:firebuild/stable || (printf \"\\n${ppaKey}\" > /etc/apt/trusted.gpg.d/firebuild-ppa.asc && printf \"deb http://ppa.launchpadcontent.net/firebuild/stable/ubuntu $(. /etc/lsb-release ; echo $DISTRIB_CODENAME) main universe\" > /etc/apt/sources.list.d/firebuild-stable-ppa.list && apt-get -qq update)'`);
    await execBashSudo("$(which eatmydata) apt-get install -y firebuild");
  } catch (error) {
    core.info("Firebuild's license is not accepted because the Firebuild App (https://github.com/apps/firebuild) is not installed.");
    core.info("Please install the Firebuild App to install Firebuild in GitHub Actions.");
  }
}

async function execBash(cmd : string) {
  await exec.exec("bash", ["-xc", cmd]);
}

async function execBashSudo(cmd : string) {
  await execBash("$(which sudo) " + cmd);
}

async function runInner() : Promise<void> {
  core.saveState("shouldSave", core.getBooleanInput("save"));
  let firebuildPath = await io.which("firebuild");
  if (!firebuildPath) {
    core.startGroup("Install firebuild");
    if (process.platform != "linux") {
      throw Error(`Unsupported platform: ${process.platform}`)
    }
    await installFirebuildLinux();
    core.info(await io.which("firebuild.exe"));
    firebuildPath = await io.which("firebuild", true);
    core.endGroup();
  }

  core.startGroup("Restore cache");
  await restore();
  core.endGroup();

  core.startGroup("Configure firebuild");
  await configure();
  await execBash("firebuild -z");
  core.endGroup();
}

async function run() : Promise<void> {
  try {
    await runInner();
  } catch (error) {
    core.setFailed(`Restoring cache failed: ${error}`);
  }
}

run();

export default run;
