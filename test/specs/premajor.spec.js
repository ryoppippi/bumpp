"use strict";

const { check, files } = require("../utils");
const { chaiExec, expect } = require("../utils/chai");

describe.skip("bump --premajor", () => {
  it("should not increment a non-existent version number", () => {
    files.create("package.json", {});
    files.create("bower.json", { name: "my-app" });

    let bump = chaiExec("--premajor");

    expect(bump).to.have.stderr("");
    expect(bump).to.have.stdout("");
    expect(bump).to.have.exitCode(0);

    expect(files.json("package.json")).to.deep.equal({});
    expect(files.json("bower.json")).to.deep.equal({ name: "my-app" });
  });

  it("should treat empty version numbers as 0.0.0", () => {
    files.create("package.json", { version: "" });
    files.create("bower.json", { version: null });
    files.create("component.json", { version: 0 });

    let bump = chaiExec("--premajor");

    expect(bump).to.have.stderr("");
    expect(bump).to.have.exitCode(0);

    bump.should.have.stdout(
      `${check} Updated package.json to 1.0.0-beta.0\n` +
      `${check} Updated bower.json to 1.0.0-beta.0\n` +
      `${check} Updated component.json to 1.0.0-beta.0\n`
    );

    expect(files.json("package.json")).to.deep.equal({ version: "1.0.0-beta.0" });
    expect(files.json("bower.json")).to.deep.equal({ version: "1.0.0-beta.0" });
    expect(files.json("component.json")).to.deep.equal({ version: "1.0.0-beta.0" });
  });

  it("should increment an all-zero version number", () => {
    files.create("package.json", { version: "0.0.0" });

    let bump = chaiExec("--premajor");

    expect(bump).to.have.stderr("");
    expect(bump).to.have.exitCode(0);

    bump.should.have.stdout(
      `${check} Updated package.json to 1.0.0-beta.0\n`
    );

    expect(files.json("package.json")).to.deep.equal({ version: "1.0.0-beta.0" });
  });

  it("should reset the minor and patch", () => {
    files.create("package.json", { version: "1.2.3" });

    let bump = chaiExec("--premajor");

    expect(bump).to.have.stderr("");
    expect(bump).to.have.exitCode(0);

    bump.should.have.stdout(
      `${check} Updated package.json to 2.0.0-beta.0\n`
    );

    expect(files.json("package.json")).to.deep.equal({ version: "2.0.0-beta.0" });
  });

  it("should reset the prerelease version", () => {
    files.create("package.json", { version: "1.2.3-beta.4" });

    let bump = chaiExec("--premajor");

    expect(bump).to.have.stderr("");
    expect(bump).to.have.exitCode(0);

    bump.should.have.stdout(
      `${check} Updated package.json to 2.0.0-beta.0\n`
    );

    expect(files.json("package.json")).to.deep.equal({ version: "2.0.0-beta.0" });
  });

  it("should honor the --preid flag", () => {
    files.create("package.json", { version: "1.2.3-beta.4" });

    let bump = chaiExec("--premajor --preid alpha");

    expect(bump).to.have.stderr("");
    expect(bump).to.have.exitCode(0);

    bump.should.have.stdout(
      `${check} Updated package.json to 2.0.0-alpha.0\n`
    );

    expect(files.json("package.json")).to.deep.equal({ version: "2.0.0-alpha.0" });
  });
});
