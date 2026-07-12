import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync("verbal-reading-pilot.html", "utf8");
const login = fs.readFileSync("login.html", "utf8");

test("practice page requires JWT and uses authenticated session APIs", () => {
  assert.match(page, /gontu_token/);
  assert.match(page, /\/api\/auth\/me/);
  assert.match(page, /\/api\/verbal-reading\/sessions/);
  assert.match(page, /\/api\/verbal-reading\/sets/);
  assert.doesNotMatch(page, /const MANIFEST_FILE/);
  assert.doesNotMatch(page, /activeSet\.files/);
});

test("practice page restores sessions and clears learning data on logout", () => {
  assert.match(page, /restoreSession\(session, practiceQuestions\)/);
  assert.match(page, /未完成练习已恢复/);
  assert.match(page, /历史成绩已恢复/);
  assert.match(page, /report\.innerHTML = ""/);
  assert.match(page, /后端练习记录没有删除/);
});

test("answers remain hidden until all 20 questions are submitted", () => {
  assert.match(page, /answeredCount !== state\.questions\.length/);
  assert.match(page, /交卷前服务端不返回答案/);
  assert.match(page, /state\.questions = session\.review_questions/);
  assert.match(page, /程序规则复盘（非 AI）/);
  assert.match(page, /不是真实 AI 诊断/);
});

test("reading questions expose real vocab cards and user-owned actions", () => {
  assert.match(page, /data-reading-term/);
  assert.match(page, /\/api\/verbal-catalog\/vocab\?search=/);
  assert.match(page, /加入复习任务/);
  assert.match(page, /\/api\/learning\/tasks/);
  assert.match(page, /人民网/);
  assert.match(page, /不生成虚假释义/);
});

test("login safely returns ordinary users to the requested local page", () => {
  assert.match(login, /function safeNextPath\(\)/);
  assert.match(login, /parsed\.origin === location\.origin/);
  assert.match(login, /safeNextPath\(\) \|\| '\/app'/);
});
