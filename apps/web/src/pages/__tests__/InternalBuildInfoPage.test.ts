import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InternalBuildInfoPage from "../InternalBuildInfoPage.vue";
import type { BuildInfo } from "../../lib/buildInfo";

const loadBuildInfoMock = vi.hoisted(() => vi.fn<() => Promise<BuildInfo>>());

vi.mock("../../lib/buildInfo", () => ({
  staticBuildInfo: {
    source: "static-env",
    startedAt: null,
    completedAt: null,
    durationMs: null,
    commitSha: null,
    commitShortSha: null,
    commitMessage: null,
    branch: null,
    repository: null,
    workflowName: null,
    runId: null,
    runNumber: null,
    runAttempt: null,
    runUrl: null,
    actor: null,
    eventName: null
  },
  loadBuildInfo: loadBuildInfoMock
}));

describe("InternalBuildInfoPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders injected GitHub Actions metadata", async () => {
    loadBuildInfoMock.mockResolvedValue({
      source: "github-actions",
      startedAt: "2026-03-23T08:10:00.000Z",
      completedAt: "2026-03-23T08:11:21.000Z",
      durationMs: 81000,
      commitSha: "abcdef1234567890abcdef1234567890abcdef12",
      commitShortSha: "abcdef1",
      commitMessage: "Add internal build metadata easter egg",
      branch: "main",
      repository: "octo/dglab-ai",
      workflowName: "Build Docker Image",
      runId: "123456789",
      runNumber: "88",
      runAttempt: "2",
      runUrl: "https://github.com/octo/dglab-ai/actions/runs/123456789",
      actor: "octocat",
      eventName: "push"
    });

    const wrapper = mount(InternalBuildInfoPage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    expect(wrapper.text()).toContain("内部构建信息");
    expect(wrapper.text()).toContain("Add internal build metadata easter egg");
    expect(wrapper.text()).toContain("abcdef1");
    expect(wrapper.text()).toContain("1 分 21 秒");
    expect(wrapper.text()).toContain("Build Docker Image");
    expect(wrapper.text()).toContain("octocat");
    expect(wrapper.text()).not.toContain("编译时兜底信息");
    expect(wrapper.html()).toContain("https://github.com/octo/dglab-ai/actions/runs/123456789");
  });
});
