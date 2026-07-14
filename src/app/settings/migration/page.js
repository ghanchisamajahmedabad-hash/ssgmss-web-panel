"use client";
import React, { useState, useEffect, useRef } from "react";
import {
  Card, Button, Typography, Progress, Statistic, Row, Col, Tag,
  Switch, InputNumber, Table, App, Alert, Space, Steps, Modal, Input,
} from "antd";
import {
  CloudUploadOutlined, ReloadOutlined, PauseCircleOutlined,
  PlayCircleOutlined, ExperimentOutlined, DatabaseOutlined,
  DeleteOutlined, WarningOutlined, DownloadOutlined,
} from "@ant-design/icons";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../../../lib/firbase-client";

const { Title, Text } = Typography;

const authFetch = async (url, opts = {}) => {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
};

const STATUS_COLORS = {
  done: "green", "dry-run-ok": "blue", "already-done": "default",
  "already-exists": "default", "no-match": "orange", "no-program": "orange",
  "skipped-status": "orange", error: "red",
  reverted: "purple", "logs-cleared": "default", "skipped-not-migrated": "orange",
};

// ─── Reusable batch runner for one migration endpoint ─────────────────────────
const MigrationRunner = ({ title, icon, endpoint, description, defaultBatch, extraColumns = [], revertLabel }) => {
  const { message, modal } = App.useApp();
  const [status, setStatus]       = useState(null);
  const [running, setRunning]     = useState(false);
  const [reverting, setReverting] = useState(false);
  const [dryRun, setDryRun]       = useState(true);
  const [resume, setResume]       = useState(true);
  const [batchSize, setBatchSize] = useState(defaultBatch);
  const [results, setResults]     = useState([]);
  const [totals, setTotals]       = useState({ done: 0, noMatch: 0, already: 0, errors: 0, reverted: 0 });
  const stopFlag = useRef(false);
  const cursor   = useRef(0);

  const fetchStatus = async () => {
    try {
      const res  = await authFetch(endpoint);
      const data = await res.json();
      if (data.success) setStatus(data.status);
      else message.error(data.message || "Failed to load status");
    } catch {
      message.error("Failed to load status");
    }
  };

  // Wait for Firebase auth to be ready before loading status — on a hard page
  // refresh auth.currentUser is null for a moment, which made the status stay
  // empty and the Revert button stay hidden/disabled until manual Refresh.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) fetchStatus();
    });
    return () => unsub();
  }, []);

  const runLoop = async () => {
    setRunning(true);
    stopFlag.current = false;
    // Resume from the last processed record (e.g. after 1020 members, continue
    // at #1021) unless "start from beginning" was chosen.
    cursor.current = resume ? (status?.resumeFrom || 0) : 0;
    if (cursor.current > 0) message.info(`Resuming after record #${cursor.current}`);
    setResults([]);
    setTotals({ done: 0, noMatch: 0, already: 0, errors: 0, reverted: 0 });

    try {
      let hasMore = true;
      while (hasMore && !stopFlag.current) {
        const res = await authFetch(endpoint, {
          method: "POST",
          body: JSON.stringify({ limit: batchSize, startAfterId: cursor.current, dryRun }),
        });
        const data = await res.json();
        if (!data.success) { message.error(data.message || "Batch failed"); break; }

        cursor.current = data.nextStartAfterId;
        hasMore = data.hasMore;

        const s = data.summary || {};
        setTotals((p) => ({
          done:    p.done    + (s.done        || 0),
          noMatch: p.noMatch + (s.noMatch     || 0),
          already: p.already + (s.alreadyDone || 0),
          errors:  p.errors  + (s.filesMissing || 0),
        }));
        setResults((prev) => [...(data.results || []).slice().reverse(), ...prev].slice(0, 300));
      }
      if (!stopFlag.current) message.success(dryRun ? "Dry run complete" : "Migration complete");
      else message.info("Stopped");
    } catch (e) {
      message.error("Migration loop failed: " + e.message);
    } finally {
      setRunning(false);
      fetchStatus();
    }
  };

  const runRevertLoop = async () => {
    setReverting(true);
    stopFlag.current = false;
    setResults([]);
    setTotals({ done: 0, noMatch: 0, already: 0, errors: 0, reverted: 0 });

    try {
      let hasMore = true;
      while (hasMore && !stopFlag.current) {
        const res = await authFetch(endpoint, {
          method: "DELETE",
          body: JSON.stringify({ limit: batchSize }),
        });
        const data = await res.json();
        if (!data.success) { message.error(data.message || "Revert batch failed"); break; }

        hasMore = data.hasMore;
        setTotals((p) => ({ ...p, reverted: p.reverted + (data.summary?.reverted || 0) }));
        setResults((prev) => [...(data.results || []).slice().reverse(), ...prev].slice(0, 300));
      }
      if (!stopFlag.current) message.success("Revert complete");
      else message.info("Stopped");
    } catch (e) {
      message.error("Revert loop failed: " + e.message);
    } finally {
      setReverting(false);
      fetchStatus();
    }
  };

  const confirmRevert = () => {
    let typed = "";
    modal.confirm({
      title: <span><WarningOutlined style={{ color: "#ff4d4f" }} /> Revert {title}?</span>,
      width: 520,
      content: (
        <div style={{ marginTop: 8 }}>
          <p>{revertLabel}</p>
          <p style={{ color: "#dc2626", fontWeight: 600 }}>
            This cannot be undone. You can re-run the migration afterwards.
          </p>
          <p>Type <b>REVERT</b> to confirm:</p>
          <Input placeholder="REVERT" onChange={(e) => { typed = e.target.value; }} />
        </div>
      ),
      okText: "Revert Now",
      okType: "danger",
      cancelText: "Cancel",
      onOk: () => {
        if (typed.trim() !== "REVERT") {
          message.error('Please type "REVERT" to confirm');
          return Promise.reject();
        }
        runRevertLoop();
      },
    });
  };

  const processed = (status?.done || 0) + (status?.noMatch || 0) + (status?.errors || 0);
  const pct = status?.totalLegacyRecords
    ? Math.round((processed / status.totalLegacyRecords) * 100)
    : 0;

  const columns = [
    { title: "Legacy ID", dataIndex: "legacyId", width: 85 },
    { title: "Name", dataIndex: "name", width: 150 },
    {
      title: "Status", dataIndex: "status", width: 120,
      render: (s) => <Tag color={STATUS_COLORS[s] || "default"}>{s}</Tag>,
    },
    ...extraColumns,
    {
      title: "Info", width: 220,
      render: (_, r) => (
        <>
          {(r.uploaded || []).map((f) => <Tag key={f} color="green" style={{ fontSize: 10 }}>{f}</Tag>)}
          {(r.missing || []).map((f) => <Tag key={f} color="red" style={{ fontSize: 10 }}>{f}</Tag>)}
          {r.error && <Text type="danger" style={{ fontSize: 11 }}>{r.error}</Text>}
        </>
      ),
    },
  ];

  return (
    <Card className="mb-6" title={<span>{icon} {title}</span>}>
      <Alert className="mb-4" type="info" showIcon message={description} />
      <Row gutter={16} className="mb-3">
        <Col span={4}><Statistic title="Legacy Records" value={status?.totalLegacyRecords ?? "—"} /></Col>
        <Col span={4}><Statistic title="Migrated" value={status?.done ?? "—"} valueStyle={{ color: "#52c41a" }} /></Col>
        <Col span={4}><Statistic title="Needs Review" value={status?.noMatch ?? "—"} valueStyle={{ color: "#fa8c16" }} /></Col>
        <Col span={4}><Statistic title="Errors/Skipped" value={status?.errors ?? "—"} valueStyle={{ color: "#ff4d4f" }} /></Col>
        <Col span={4}><Statistic title="Remaining" value={status?.remaining ?? "—"} /></Col>
        <Col span={4} style={{ display: "flex", alignItems: "center" }}>
          <Button icon={<ReloadOutlined />} onClick={fetchStatus}>Refresh</Button>
        </Col>
      </Row>
      <Progress percent={pct} status={running ? "active" : "normal"} className="mb-4" />

      <Space size="large" wrap className="mb-4">
        <span>
          <Text className="mr-2">Dry Run (preview only, no writes)</Text>
          <Switch checked={dryRun} onChange={setDryRun} disabled={running} />
        </span>
        <span>
          <Text className="mr-2">Batch size</Text>
          <InputNumber min={1} max={50} value={batchSize} onChange={(v) => setBatchSize(v || defaultBatch)} disabled={running} />
        </span>
        <span>
          <Text className="mr-2">Resume from last position{status?.resumeFrom ? ` (after #${status.resumeFrom})` : ""}</Text>
          <Switch checked={resume} onChange={setResume} disabled={running || reverting} />
        </span>
        {!running && !reverting ? (
          <>
            <Button type="primary" icon={dryRun ? <ExperimentOutlined /> : <PlayCircleOutlined />} onClick={runLoop}>
              {dryRun ? "Start Dry Run" : "Start Migration"}
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={confirmRevert}
              disabled={!status || !status.done}
            >
              Revert Migration
            </Button>
          </>
        ) : (
          <Button danger icon={<PauseCircleOutlined />} onClick={() => { stopFlag.current = true; }}>
            Stop
          </Button>
        )}
        <Tag color="green">Done: {totals.done}</Tag>
        <Tag color="default">Already: {totals.already}</Tag>
        <Tag color="orange">Review: {totals.noMatch}</Tag>
        <Tag color="red">Errors: {totals.errors}</Tag>
        {totals.reverted > 0 && <Tag color="purple">Reverted: {totals.reverted}</Tag>}
      </Space>

      <Table
        dataSource={results}
        columns={columns}
        rowKey={(r, i) => `${r.legacyId}-${i}`}
        size="small"
        pagination={{ pageSize: 25 }}
      />
    </Card>
  );
};

// ─── Panel: members that did NOT migrate (+ retry) ────────────────────────────
const SkippedMembersPanel = () => {
  const { message } = App.useApp();
  const [loading, setLoading]   = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [data, setData]         = useState(null);
  const stopFlag = useRef(false);

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/migrate-member-data?view=skipped");
      const d = await res.json();
      if (d.success) setData(d);
      else message.error(d.message || "Failed to load list");
    } catch {
      message.error("Failed to load skipped members list");
    } finally {
      setLoading(false);
    }
  };

  const retryLoop = async () => {
    setRetrying(true);
    stopFlag.current = false;
    let cursor = 0;
    let migrated = 0;
    try {
      let hasMore = true;
      while (hasMore && !stopFlag.current) {
        const res = await authFetch("/api/migrate-member-data", {
          method: "POST",
          body: JSON.stringify({ retrySkipped: true, limit: 10, startAfterId: cursor }),
        });
        const d = await res.json();
        if (!d.success) { message.error(d.message || "Retry batch failed"); break; }
        hasMore = d.hasMore;
        cursor  = d.nextStartAfterId;
        migrated += d.summary?.done || 0;
      }
      message.success(`Retry finished — ${migrated} member(s) migrated`);
    } catch (e) {
      message.error("Retry failed: " + e.message);
    } finally {
      setRetrying(false);
      loadList();
    }
  };

  // Download the not-migrated list as CSV (UTF-8 BOM so Excel shows Hindi correctly)
  const downloadCsv = () => {
    const rows = data?.skipped || [];
    if (!rows.length) { message.info("Nothing to download — load the list first"); return; }
    const headers = ["Legacy ID", "Form ID", "Name", "Father Name", "Aadhaar", "Phone", "Old App No", "Yojna ID", "Status", "Reason"];
    const esc = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers.join(","),
      ...rows.map((r) => [
        r.legacyId, r.formId, r.name, r.fatherName, r.aadhaar, r.phone,
        r.applicationNo, r.yojanaId, r.status, r.reason,
      ].map(esc).join(",")),
    ];
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `not-migrated-members-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success(`CSV downloaded — ${rows.length} member(s)`);
  };

  const columns = [
    { title: "Legacy ID", dataIndex: "legacyId", width: 80 },
    { title: "Name", dataIndex: "name", width: 140 },
    { title: "Father", dataIndex: "fatherName", width: 120 },
    { title: "Aadhaar", dataIndex: "aadhaar", width: 120 },
    { title: "Phone", dataIndex: "phone", width: 100 },
    { title: "Old App No", dataIndex: "applicationNo", width: 95 },
    { title: "Yojna ID", dataIndex: "yojanaId", width: 70 },
    {
      title: "Status", dataIndex: "status", width: 115,
      render: (s) => <Tag color={STATUS_COLORS[s] || "orange"}>{s}</Tag>,
    },
    { title: "Reason", dataIndex: "reason", ellipsis: true },
  ];

  return (
    <Card
      className="mb-6"
      title={<span><WarningOutlined style={{ color: "#fa8c16" }} /> Not-Migrated Members</span>}
    >
      <Alert
        className="mb-4"
        type="warning"
        showIcon
        message="Members from the old system that were skipped or failed during migration."
        description="'no-program' = yojna legacyId mapping missing • 'skipped-status' = rejected/deleted in old system • 'error' = processing failed • 'already-exists' = member already in the system (not retryable). Fix the cause (e.g. set the yojna's Old System ID), then Retry."
      />
      <Space className="mb-4" size="large" wrap>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={loadList}>
          Load Not-Migrated List
        </Button>
        <Button
          icon={<DownloadOutlined />}
          disabled={!data || !data.skipped?.length}
          onClick={downloadCsv}
        >
          Download CSV ({data?.counts?.skippedTotal ?? 0})
        </Button>
        {!retrying ? (
          <Button
            type="primary"
            danger
            icon={<PlayCircleOutlined />}
            disabled={!data || !data.counts?.retryable}
            onClick={retryLoop}
          >
            Retry Skipped ({data?.counts?.retryable ?? 0})
          </Button>
        ) : (
          <Button danger icon={<PauseCircleOutlined />} onClick={() => { stopFlag.current = true; }}>
            Stop Retry
          </Button>
        )}
        {data && (
          <>
            <Tag color="orange">Skipped/Failed: {data.counts.skippedTotal}</Tag>
            <Tag color="blue">Retryable: {data.counts.retryable}</Tag>
            <Tag color="default">Not yet processed: {data.counts.unprocessed}</Tag>
          </>
        )}
      </Space>
      <Table
        dataSource={data?.skipped || []}
        columns={columns}
        rowKey="legacyId"
        size="small"
        loading={loading}
        pagination={{ pageSize: 50, showTotal: (t) => `${t} not-migrated member(s)` }}
        scroll={{ x: 1000 }}
      />
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
const MigrationPage = () => {
  return (
    <div className="p-4">
      <Title level={4}><CloudUploadOutlined /> Old System Migration</Title>
      <Steps
        className="mb-6"
        size="small"
        items={[
          { title: "Step 1 — Member Data + Media", description: "Creates members with old IDs mapped AND migrates their photos & documents in the same pass" },
          { title: "Step 2 — Media (leftover only)", description: "Optional: catches any photos/documents that failed or were skipped in Step 1" },
        ]}
      />

      <MigrationRunner
        title="Step 1: Member Data + Media Migration"
        icon={<DatabaseOutlined />}
        endpoint="/api/migrate-member-data"
        defaultBatch={10}
        description={
          "Creates member documents from the old system (app_forms + app_forms_yojana) AND migrates each member's photos & documents in the same pass. " +
          "Old IDs are mapped via the legacyId field on: agents, states, districts, cities, castes, relations, and yojnas (programs). " +
          "Age group & period are resolved from date of birth + join date; join fees & fixed fees come from the OLD system's 'fees' (kist → pay amount), and ALL migrated members are marked fully PAID on the member doc only. " +
          "Only MEMBER COUNTS update on agent/yojna/organization (no amounts, no transactions, no commission). Duplicates (same Aadhaar + same yojna) are skipped. Run a Dry Run first and check the 'resolved' flags."
        }
        revertLabel={
          "This deletes ALL migrated members (only members created by this migration — manually added members are never touched), " +
          "removes their payment records and migrated photos/documents, reverses agent/program/organization totals and any commissions, " +
          "and clears the migration logs so you can re-run a corrected migration."
        }
        extraColumns={[
          { title: "New Reg No", dataIndex: "regNo", width: 105 },
          { title: "Old App No", dataIndex: "oldApplicationNo", width: 95 },
          { title: "Program", dataIndex: "program", width: 130 },
          { title: "Agent", dataIndex: "agent", width: 130 },
          {
            title: "Resolved", width: 200,
            render: (_, r) => r.resolved
              ? Object.entries(r.resolved).map(([k, v]) => (
                  <Tag key={k} color={v ? "green" : "red"} style={{ fontSize: 9 }}>{k}</Tag>
                ))
              : null,
          },
        ]}
      />

      <SkippedMembersPanel />

      <MigrationRunner
        title="Step 2: Member Media Migration"
        icon={<CloudUploadOutlined />}
        endpoint="/api/migrate-member-media"
        defaultBatch={15}
        description={
          "Uploads legacy photos & documents to Firebase Storage and links them on member profiles. " +
          "Matching by Aadhaar number (fallback: phone + name). Existing photos are never overwritten. Run AFTER Step 1."
        }
        revertLabel={
          "This removes the migrated photos/documents from Firebase Storage and clears those photo/document links on members " +
          "(only links created by this migration — manually uploaded photos are never touched), and clears the media migration logs."
        }
      />
    </div>
  );
};

export default MigrationPage;
