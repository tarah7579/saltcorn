/**
 * @category saltcorn-cli
 * @module commands/release
 */
const { Command, Flags, Args } = require("@oclif/core");
const fs = require("fs");
const { spawnSync } = require("child_process");
const { sleep } = require("../../common");

/**
 * ReleaseCommand Class
 * @extends oclif.Command
 * @category saltcorn-cli
 */
class ReleaseCommand extends Command {
  /**
   * @returns {Promise<void>}
   */
  async run() {
    const {
      args: { version },
      flags,
    } = await this.parse(ReleaseCommand);
    spawnSync("git", ["pull"], {
      stdio: "inherit",
      cwd: ".",
    });
    console.log("\nCurrent branch: \n");
    spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      stdio: "inherit",
      cwd: ".",
    });
    console.log("\n");

    spawnSync("git", ["show", "--summary"], {
      stdio: "inherit",
      cwd: ".",
    });
    console.log("Release begins in five seconds, press Ctrl-C to abort");
    await sleep(5000);
    const pkgs = {
      "@saltcorn/db-common": { dir: "db-common", publish: true },
      "@saltcorn/common-code": { dir: "common-code", publish: true },
      "@saltcorn/plugins-loader": { dir: "plugins-loader", publish: true },
      "@saltcorn/sqlite": { dir: "sqlite", publish: true },
      "@saltcorn/sqlite-mobile": { dir: "sqlite-mobile", publish: true },
      "@saltcorn/postgres": { dir: "postgres", publish: true },
      "@saltcorn/types": { dir: "saltcorn-types", publish: true },
      "@saltcorn/builder": { dir: "saltcorn-builder", publish: true },
      "@saltcorn/filemanager": { dir: "filemanager", publish: true },
      "@saltcorn/data": { dir: "saltcorn-data", publish: true },
      "@saltcorn/admin-models": {
        dir: "saltcorn-admin-models",
        publish: true,
      },
      "@saltcorn/random-tests": { dir: "saltcorn-random-tests" },
      "@saltcorn/server": { dir: "server", publish: true },
      "@saltcorn/base-plugin": { dir: "saltcorn-base-plugin", publish: true },
      //"saltcorn-cli", publish: true},
      "@saltcorn/markup": { dir: "saltcorn-markup", publish: true },
      "@saltcorn/mobile-app": { dir: "saltcorn-mobile-app", publish: true },
      "@saltcorn/mobile-builder": {
        dir: "saltcorn-mobile-builder",
        publish: true,
      },
      "@saltcorn/sbadmin2": { dir: "saltcorn-sbadmin2", publish: true },
    };

    const updateDependencies = (json, dpkgnm, version) => {
      if (json.dependencies && json.dependencies[dpkgnm])
        json.dependencies[dpkgnm] = version;
      if (json.devDependencies && json.devDependencies[dpkgnm])
        json.devDependencies[dpkgnm] = version;
      if (json.optionalDependencies && json.optionalDependencies[dpkgnm])
        json.optionalDependencies[dpkgnm] = version;
    };

    const updatePkgJson = (dir) => {
      const json = require(`../../../../${dir}/package.json`);
      json.version = version;
      if (json.dependencies || json.devDependencies)
        Object.keys(pkgs).forEach((dpkgnm) => {
          updateDependencies(json, dpkgnm, version);
        });
      updateDependencies(json, "@saltcorn/cli", version);
      fs.writeFileSync(
        `packages/${dir}/package.json`,
        JSON.stringify(json, null, 2)
      );
    };
    const compileTsFiles = () => {
      spawnSync("npm", ["install"], {
        stdio: "inherit",
        cwd: ".",
      });
      spawnSync("npm", ["run", "tsc"], {
        stdio: "inherit",
        cwd: ".",
      });
    };
    const publish = async (dir, tags0) => {
      const tags = !tags0 ? [] : Array.isArray(tags0) ? tags0 : [tags0];
      if (flags.tag) tags.push(flags.tag);
      const firstTag = tags[0];
      console.log(
        `packages/${dir}$ npm publish --access=public ${firstTag ? `--tag ${firstTag}` : ""}`
      );
      spawnSync(
        "npm",
        [
          "publish",
          "--access=public",
          ...(firstTag ? [`--tag ${firstTag}`] : []),
        ],
        {
          stdio: "inherit",
          cwd: `packages/${dir}/`,
        }
      );
      tags.shift();
      for (const tag of tags) {
        await sleep(3000);
        console.log(`packages/${dir}$ npm dist-tag add @saltcorn/cli@${version} ${tag}`);
        spawnSync("npm", ["dist-tag", "add", `@saltcorn/cli@${version}`, tag], {
          stdio: "inherit",
          cwd: `packages/${dir}/`,
        });
      }
    };

    const rootPackageJson = require(`../../../../../package.json`);

    compileTsFiles();
    //for each package:
    // 1. update version
    // 2. update dependencies for other packages
    // 3. publish
    spawnSync("npm", ["install"], {
      stdio: "inherit",
      cwd: `packages/saltcorn-cli/`,
    });
    for (const p of Object.values(pkgs)) {
      updatePkgJson(p.dir);
      if (p.publish) {
        await publish(p.dir);
        await sleep(3000);
      }
    }
    await sleep(5000);

    // for cli:
    // 1. update version
    // 2. update dependencies for other pkgs
    // 3. run npm update
    // 3. publish
    updatePkgJson("saltcorn-cli");
    fs.writeFileSync(
      `package.json`,
      JSON.stringify({ ...rootPackageJson, workspaces: undefined }, null, 2)
    );
    spawnSync("npm", ["update", "--legacy-peer-deps"], {
      stdio: "inherit",
      cwd: `packages/saltcorn-cli/`,
    });
    spawnSync("npm", ["install"], {
      stdio: "inherit",
      cwd: ".",
    });
    // do not run 'audit fix' on full point releases, only on -beta.x, -rc.x etc
    /*if (version.includes("-"))
      spawnSync("npm", ["audit", "fix"], {
        stdio: "inherit",
        cwd: `packages/saltcorn-cli/`,
      });*/
    await publish("saltcorn-cli", "next");
    fs.writeFileSync(`package.json`, JSON.stringify(rootPackageJson, null, 2));
    // update Dockerfile
    const dockerfile = fs.readFileSync(`Dockerfile.release`, "utf8");
    fs.writeFileSync(
      `Dockerfile.release`,
      dockerfile.replace(/cli@.* --unsafe/, `cli@${version} --unsafe`)
    );
    const dockerfileWithMobile = fs.readFileSync(
      `Dockerfile.mobile.release`,
      "utf8"
    );
    fs.writeFileSync(
      `Dockerfile.mobile.release`,
      dockerfileWithMobile.replace(/cli@.* --unsafe/, `cli@${version} --unsafe`)
    );
    //git commit tag and push
    spawnSync("git", ["commit", "-am", "v" + version], {
      stdio: "inherit",
    });
    spawnSync("git", ["tag", "-a", "v" + version, "-m", "v" + version], {
      stdio: "inherit",
    });
    spawnSync("git", ["push", "origin", "v" + version], {
      stdio: "inherit",
    });
    spawnSync("git", ["push"], {
      stdio: "inherit",
    });
    console.log("Now run:\n");
    console.log("  rm -rf packages/saltcorn-cli/node_modules\n");
    console.log("  rm -rf node_modules\n");
    this.exit(0);
  }
}

/**
 * @type {string}
 */
ReleaseCommand.description = `Release a new saltcorn version`;

/**
 * @type {object}
 */
ReleaseCommand.args = {
  version: Args.string({
    required: true,
    description: "New version number",
  }),
};

ReleaseCommand.flags = {
  tag: Flags.string({
    char: "t",
    description: "NPM tag",
  }),
};
module.exports = ReleaseCommand;
