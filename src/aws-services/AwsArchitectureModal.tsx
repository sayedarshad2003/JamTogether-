import React, { useEffect, useState } from 'react';
import { X, Database, Server, ShieldCheck, Radio, Layers, RefreshCw } from 'lucide-react';
import { apiRequest } from './apiClient.ts';
import { DynamoDBTableSchemaDoc } from '../types/jam.ts';

interface AwsArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ArchitectureResponse {
  awsRegion: string;
  dynamoDbConnected: boolean;
  cognitoConfigured: boolean;
  youtubeApiConfigured: boolean;
  tablePrefix: string;
  totalDynamoItems: number;
  countsByEntity: Record<string, number>;
  schemas: DynamoDBTableSchemaDoc[];
  sampleItems: Array<{
    PK: string;
    SK: string;
    GSI1PK?: string;
    entityType: string;
  }>;
}

export function AwsArchitectureModal({ isOpen, onClose }: AwsArchitectureModalProps) {
  const [data, setData] = useState<ArchitectureResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dynamodb' | 'live-items' | 'amplify'>('dynamodb');

  const fetchArch = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<ArchitectureResponse>('/api/aws/architecture');
      setData(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchArch();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Database & Microsoft Excel (.xlsx) Engine
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                No SQL database required · Live persistence to <code className="font-mono text-emerald-600 dark:text-emerald-400">data/jamtogether_database.xlsx</code>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/database/excel"
              download="jamtogether_database.xlsx"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center gap-1.5 shadow-sm"
              title="Download live Excel file"
            >
              <span>📥 Download .xlsx</span>
            </a>
            <button
              onClick={fetchArch}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Refresh Partition State"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-4 shrink-0 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#181B28]">
            <button
              onClick={() => setActiveTab('dynamodb')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'dynamodb'
                  ? 'bg-white dark:bg-[#11131C] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              DynamoDB NoSQL Schemas (8 Models)
            </button>
            <button
              onClick={() => setActiveTab('live-items')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'live-items'
                  ? 'bg-white dark:bg-[#11131C] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Live Partition/Sort Key Inspector ({data?.totalDynamoItems || 0})
            </button>
            <button
              onClick={() => setActiveTab('amplify')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'amplify'
                  ? 'bg-white dark:bg-[#11131C] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              AWS Amplify & WebRTC Setup Guide
            </button>
          </div>

          {data && (
            <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono">
              <span>Region: {data.awsRegion}</span>
              <span>·</span>
              <span>Prefix: {data.tablePrefix}</span>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'dynamodb' && data && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                JamTogether strictly uses non-relational Amazon DynamoDB Partition Key (PK), Sort Key
                (SK), and Global Secondary Index (GSI1) access patterns. Zero SQL/relational joins are
                used.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.schemas.map((schema) => (
                  <div
                    key={schema.tableName}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-800 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {schema.tableName}
                      </h3>
                      <span className="text-xs font-mono text-violet-600 dark:text-violet-400">
                        {schema.sampleKey.PK.split('#')[0]}#
                      </span>
                    </div>
                    <div className="space-y-1 text-xs font-mono">
                      <p className="text-slate-700 dark:text-slate-300">
                        <span className="text-slate-400">PK: </span>
                        {schema.partitionKey}
                      </p>
                      <p className="text-slate-700 dark:text-slate-300">
                        <span className="text-slate-400">SK: </span>
                        {schema.sortKey}
                      </p>
                      {schema.gsi1 && (
                        <p className="text-blue-600 dark:text-blue-400">
                          <span className="text-slate-400">GSI1: </span>
                          {schema.gsi1}
                        </p>
                      )}
                    </div>
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 space-y-1">
                      {schema.accessPatterns.map((ap, i) => (
                        <p key={i} className="text-[11px] text-slate-500 dark:text-slate-400">
                          • {ap}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'live-items' && data && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(data.countsByEntity).map(([entity, count]) => (
                  <div
                    key={entity}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-800"
                  >
                    <p className="text-xs text-slate-500 dark:text-slate-400">{entity} Items</p>
                    <p className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {count}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-[#181B28] text-[11px] font-semibold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2.5 px-4">Entity</th>
                      <th className="py-2.5 px-4">Partition Key (PK)</th>
                      <th className="py-2.5 px-4">Sort Key (SK)</th>
                      <th className="py-2.5 px-4">GSI1PK</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs font-mono">
                    {data.sampleItems.map((item, idx) => (
                      <tr
                        key={`${item.PK}-${item.SK}-${idx}`}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-2 px-4 text-violet-600 dark:text-violet-400 font-semibold">
                          {item.entityType}
                        </td>
                        <td className="py-2 px-4 text-slate-900 dark:text-slate-200">{item.PK}</td>
                        <td className="py-2 px-4 text-slate-600 dark:text-slate-400">{item.SK}</td>
                        <td className="py-2 px-4 text-blue-600 dark:text-blue-400">
                          {item.GSI1PK || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'amplify' && (
            <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold">
                    <ShieldCheck className="w-4 h-4 text-violet-500" />
                    <span>1. AWS Cognito User Pool</span>
                  </div>
                  <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                    Set <code className="font-mono">COGNITO_USER_POOL_ID</code> and{' '}
                    <code className="font-mono">COGNITO_CLIENT_ID</code> in environment variables.
                    All API routes validate Bearer tokens server-side without exposing AWS secrets to
                    the browser.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold">
                    <Layers className="w-4 h-4 text-blue-500" />
                    <span>2. Amazon DynamoDB Table</span>
                  </div>
                  <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                    Provision table <code className="font-mono">JamTogether_CoreTable</code> with
                    Partition Key <code className="font-mono">PK (String)</code>, Sort Key{' '}
                    <code className="font-mono">SK (String)</code>, and GSI{' '}
                    <code className="font-mono">GSI1 (GSI1PK, GSI1SK)</code> on Pay-Per-Request
                    billing.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#181B28] border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold">
                    <Radio className="w-4 h-4 text-emerald-500" />
                    <span>3. WebRTC & Sync Engine</span>
                  </div>
                  <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                    Audio flows directly peer-to-peer over WebRTC using STUN/TURN ICE servers.
                    Playback sync uses server-authoritative timestamps so all listeners stay locked
                    within &lt;200ms.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 text-slate-200 font-mono text-xs overflow-x-auto">
                <p className="text-slate-400 mb-2"># amplify.yml — AWS Amplify Hosting Build Specification</p>
                <pre>{`version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*`}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
