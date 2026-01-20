# Data Visualization Guide - Workflow Engine

> **Tools Covered**: NoSQLBooster, pgAdmin, DBeaver, Grafana  
> **Database**: PostgreSQL with workflow execution data  
> **Date**: January 21, 2026

---

## 📊 Overview

This guide shows you how to visualize and analyze workflow engine data using various tools. While NoSQLBooster is primarily for MongoDB, we'll show you how to use it for PostgreSQL analysis, plus better alternatives.

---

## 🗄️ Database Schema Overview

### **Core Tables**
```sql
-- Users table
users (id, email, first_name, last_name, roles, created_at, updated_at)

-- Workflows table  
workflows (id, user_id, name, description, enabled, trigger, steps, trigger_path, created_at, updated_at)

-- Workflow Runs table
workflow_runs (id, workflow_id, user_id, status, input_context, output_context, error_details, step_count, current_step, started_at, completed_at, duration_ms)

-- API Keys table
api_keys (id, user_id, name, key_prefix, key_hash, scopes, last_used_at, expires_at, created_at)
```

### **Key Relationships**
- `workflows.user_id` → `users.id`
- `workflow_runs.workflow_id` → `workflows.id`
- `workflow_runs.user_id` → `users.id`
- `api_keys.user_id` → `users.id`

---

## 🔧 Tool Setup & Connection

### **Option 1: NoSQLBooster (Limited PostgreSQL Support)**

NoSQLBooster has limited PostgreSQL support, but you can use it for basic queries:

#### Connection Setup
1. **Download**: [NoSQLBooster for MongoDB](https://nosqlbooster.com/)
2. **Connection**: 
   - Host: `localhost`
   - Port: `5432`
   - Database: `workflow_engine`
   - Username: `workflow_user`
   - Password: `workflow_pass`

#### Limitations
- ⚠️ **Limited SQL Support**: Basic queries only
- ⚠️ **No Advanced Visualizations**: Charts not optimized for PostgreSQL
- ⚠️ **JSON Handling**: Limited JSONB query capabilities

---

### **Option 2: pgAdmin (Recommended for PostgreSQL)**

#### Installation & Setup
```bash
# macOS
brew install --cask pgadmin4

# Or download from: https://www.pgadmin.org/download/
```

#### Connection Configuration
1. **Server Details**:
   - Name: `Workflow Engine Local`
   - Host: `localhost`
   - Port: `5432`
   - Database: `workflow_engine`
   - Username: `workflow_user`
   - Password: `workflow_pass`

#### Key Features
- ✅ **Native PostgreSQL Support**
- ✅ **Query Tool with Syntax Highlighting**
- ✅ **Visual Query Builder**
- ✅ **Data Export/Import**
- ✅ **Performance Monitoring**

---

### **Option 3: DBeaver (Best Free Alternative)**

#### Installation
```bash
# macOS
brew install --cask dbeaver-community

# Or download from: https://dbeaver.io/download/
```

#### Connection Setup
1. **New Connection** → **PostgreSQL**
2. **Connection Settings**:
   - Server Host: `localhost`
   - Port: `5432`
   - Database: `workflow_engine`
   - Username: `workflow_user`
   - Password: `workflow_pass`

#### Advanced Features
- ✅ **Visual Data Editor**
- ✅ **ER Diagrams**
- ✅ **Query Execution Plans**
- ✅ **Data Visualization Charts**
- ✅ **Export to Multiple Formats**

---

## 📈 Data Visualization Queries

### **1. Workflow Execution Analytics**

#### Success Rate by Workflow
```sql
SELECT 
    w.name as workflow_name,
    COUNT(*) as total_runs,
    COUNT(CASE WHEN wr.status = 'success' THEN 1 END) as successful_runs,
    COUNT(CASE WHEN wr.status = 'failed' THEN 1 END) as failed_runs,
    COUNT(CASE WHEN wr.status = 'skipped' THEN 1 END) as skipped_runs,
    ROUND(
        COUNT(CASE WHEN wr.status = 'success' THEN 1 END) * 100.0 / COUNT(*), 
        2
    ) as success_rate_percent
FROM workflows w
LEFT JOIN workflow_runs wr ON w.id = wr.workflow_id
WHERE w.enabled = true
GROUP BY w.id, w.name
ORDER BY total_runs DESC;
```

**Visualization**: Bar chart showing success rates per workflow

#### Daily Execution Trends
```sql
SELECT 
    DATE(wr.started_at) as execution_date,
    COUNT(*) as total_executions,
    COUNT(CASE WHEN wr.status = 'success' THEN 1 END) as successful,
    COUNT(CASE WHEN wr.status = 'failed' THEN 1 END) as failed,
    AVG(wr.duration_ms) as avg_duration_ms
FROM workflow_runs wr
WHERE wr.started_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(wr.started_at)
ORDER BY execution_date DESC;
```

**Visualization**: Line chart showing execution trends over time

#### Performance Analysis
```sql
SELECT 
    w.name as workflow_name,
    COUNT(wr.id) as execution_count,
    AVG(wr.duration_ms) as avg_duration_ms,
    MIN(wr.duration_ms) as min_duration_ms,
    MAX(wr.duration_ms) as max_duration_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY wr.duration_ms) as median_duration_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY wr.duration_ms) as p95_duration_ms
FROM workflows w
JOIN workflow_runs wr ON w.id = wr.workflow_id
WHERE wr.status = 'success'
  AND wr.started_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY w.id, w.name
HAVING COUNT(wr.id) > 0
ORDER BY avg_duration_ms DESC;
```

**Visualization**: Performance dashboard with duration metrics

### **2. User Activity Analysis**

#### User Engagement Metrics
```sql
SELECT 
    u.email,
    u.first_name || ' ' || u.last_name as full_name,
    COUNT(DISTINCT w.id) as workflows_created,
    COUNT(wr.id) as total_executions,
    MAX(wr.started_at) as last_execution,
    DATE_PART('day', NOW() - MAX(wr.started_at)) as days_since_last_execution
FROM users u
LEFT JOIN workflows w ON u.id = w.user_id
LEFT JOIN workflow_runs wr ON w.id = wr.workflow_id
GROUP BY u.id, u.email, u.first_name, u.last_name
ORDER BY total_executions DESC;
```

#### Workflow Creation Timeline
```sql
SELECT 
    DATE_TRUNC('week', w.created_at) as week_start,
    COUNT(*) as workflows_created,
    COUNT(DISTINCT w.user_id) as active_users
FROM workflows w
WHERE w.created_at >= CURRENT_DATE - INTERVAL '12 weeks'
GROUP BY DATE_TRUNC('week', w.created_at)
ORDER BY week_start;
```

### **3. Error Analysis**

#### Most Common Errors
```sql
SELECT 
    wr.error_details->>'message' as error_message,
    wr.error_details->>'code' as error_code,
    COUNT(*) as occurrence_count,
    COUNT(DISTINCT wr.workflow_id) as affected_workflows,
    MAX(wr.started_at) as last_occurrence
FROM workflow_runs wr
WHERE wr.status = 'failed' 
  AND wr.error_details IS NOT NULL
  AND wr.started_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY wr.error_details->>'message', wr.error_details->>'code'
ORDER BY occurrence_count DESC
LIMIT 10;
```

#### Error Rate by Step Type
```sql
WITH step_analysis AS (
    SELECT 
        wr.id,
        wr.status,
        wr.error_details->>'step' as failed_step,
        jsonb_array_elements(w.steps)->>'type' as step_type,
        ROW_NUMBER() OVER (PARTITION BY wr.id ORDER BY jsonb_array_elements(w.steps)) as step_position
    FROM workflow_runs wr
    JOIN workflows w ON wr.workflow_id = w.id
    WHERE wr.started_at >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT 
    step_type,
    COUNT(*) as total_steps_executed,
    COUNT(CASE WHEN status = 'failed' AND failed_step::int = step_position - 1 THEN 1 END) as failed_at_step,
    ROUND(
        COUNT(CASE WHEN status = 'failed' AND failed_step::int = step_position - 1 THEN 1 END) * 100.0 / COUNT(*),
        2
    ) as failure_rate_percent
FROM step_analysis
GROUP BY step_type
ORDER BY failure_rate_percent DESC;
```

### **4. Workflow Step Analysis**

#### Step Type Usage
```sql
SELECT 
    step_data->>'type' as step_type,
    COUNT(*) as usage_count,
    COUNT(DISTINCT w.id) as workflows_using,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage_of_total
FROM workflows w,
     jsonb_array_elements(w.steps) as step_data
WHERE w.enabled = true
GROUP BY step_data->>'type'
ORDER BY usage_count DESC;
```

#### Complex Workflow Analysis
```sql
SELECT 
    w.name,
    jsonb_array_length(w.steps) as step_count,
    COUNT(wr.id) as execution_count,
    AVG(wr.duration_ms) as avg_duration,
    COUNT(CASE WHEN wr.status = 'success' THEN 1 END) as success_count,
    ROUND(
        COUNT(CASE WHEN wr.status = 'success' THEN 1 END) * 100.0 / COUNT(wr.id),
        2
    ) as success_rate
FROM workflows w
LEFT JOIN workflow_runs wr ON w.id = wr.workflow_id
WHERE w.enabled = true
GROUP BY w.id, w.name, jsonb_array_length(w.steps)
HAVING COUNT(wr.id) > 0
ORDER BY step_count DESC, success_rate DESC;
```

---

## 📊 Visualization Recommendations

### **DBeaver Visualizations**

#### 1. **Execution Success Rate Dashboard**
```sql
-- Query for pie chart
SELECT 
    status,
    COUNT(*) as count
FROM workflow_runs 
WHERE started_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY status;
```

**Chart Type**: Pie Chart  
**X-axis**: status  
**Y-axis**: count

#### 2. **Performance Trend Line**
```sql
-- Query for line chart
SELECT 
    DATE(started_at) as date,
    AVG(duration_ms) as avg_duration
FROM workflow_runs 
WHERE status = 'success'
  AND started_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(started_at)
ORDER BY date;
```

**Chart Type**: Line Chart  
**X-axis**: date  
**Y-axis**: avg_duration

#### 3. **Workflow Popularity Bar Chart**
```sql
-- Query for bar chart
SELECT 
    w.name,
    COUNT(wr.id) as executions
FROM workflows w
JOIN workflow_runs wr ON w.id = wr.workflow_id
WHERE wr.started_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY w.name
ORDER BY executions DESC
LIMIT 10;
```

**Chart Type**: Bar Chart  
**X-axis**: name  
**Y-axis**: executions

---

## 🎯 Advanced Analytics with Grafana

### **Setup Grafana Dashboard**

#### Installation
```bash
# macOS
brew install grafana

# Start Grafana
brew services start grafana

# Access: http://localhost:3000
# Default login: admin/admin
```

#### PostgreSQL Data Source
1. **Configuration** → **Data Sources** → **Add PostgreSQL**
2. **Connection Details**:
   - Host: `localhost:5432`
   - Database: `workflow_engine`
   - User: `workflow_user`
   - Password: `workflow_pass`
   - SSL Mode: `disable`

#### Sample Dashboard Panels

##### Panel 1: Real-time Execution Rate
```sql
SELECT 
    $__time(started_at),
    COUNT(*) as executions
FROM workflow_runs
WHERE $__timeFilter(started_at)
GROUP BY $__timeGroup(started_at, '1h')
ORDER BY 1;
```

##### Panel 2: Success Rate Gauge
```sql
SELECT 
    ROUND(
        COUNT(CASE WHEN status = 'success' THEN 1 END) * 100.0 / COUNT(*),
        2
    ) as success_rate
FROM workflow_runs
WHERE started_at >= NOW() - INTERVAL '24 hours';
```

##### Panel 3: Top Failing Workflows
```sql
SELECT 
    w.name,
    COUNT(CASE WHEN wr.status = 'failed' THEN 1 END) as failures
FROM workflows w
JOIN workflow_runs wr ON w.id = wr.workflow_id
WHERE wr.started_at >= NOW() - INTERVAL '24 hours'
GROUP BY w.name
HAVING COUNT(CASE WHEN wr.status = 'failed' THEN 1 END) > 0
ORDER BY failures DESC
LIMIT 5;
```

---

## 🔍 NoSQLBooster Specific Usage

Since you mentioned NoSQLBooster, here's how to use it with PostgreSQL (limited functionality):

### **Connection Steps**
1. **New Connection** → **PostgreSQL**
2. **Connection String**: `postgresql://workflow_user:workflow_pass@localhost:5432/workflow_engine`

### **Basic Queries**
```sql
-- Simple workflow list
SELECT name, enabled, created_at FROM workflows LIMIT 10;

-- Recent runs
SELECT status, started_at, duration_ms 
FROM workflow_runs 
ORDER BY started_at DESC 
LIMIT 20;

-- User statistics
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as new_users_30d
FROM users;
```

### **JSON Data Exploration**
```sql
-- Explore workflow steps
SELECT 
    name,
    jsonb_pretty(steps) as formatted_steps
FROM workflows 
WHERE id = 'your-workflow-id';

-- Analyze input contexts
SELECT 
    jsonb_pretty(input_context) as formatted_input
FROM workflow_runs 
WHERE status = 'success'
LIMIT 5;
```

---

## 📋 Quick Start Checklist

### **For Immediate Data Exploration**

1. **✅ Install DBeaver** (Best free option)
   ```bash
   brew install --cask dbeaver-community
   ```

2. **✅ Connect to Database**
   - Host: `localhost:5432`
   - Database: `workflow_engine`
   - User: `workflow_user`
   - Password: `workflow_pass`

3. **✅ Run Sample Queries**
   - Copy queries from sections above
   - Create visualizations in DBeaver
   - Export results as needed

4. **✅ Set Up Monitoring** (Optional)
   - Install Grafana for real-time dashboards
   - Configure PostgreSQL data source
   - Import sample dashboard panels

---

## 🎨 Visualization Examples

### **Sample Dashboard Layout**

```
┌─────────────────┬─────────────────┐
│   Success Rate  │  Daily Executions│
│      Gauge      │   Line Chart     │
├─────────────────┼─────────────────┤
│  Top Workflows  │  Error Analysis  │
│   Bar Chart     │   Table View     │
├─────────────────┴─────────────────┤
│        Recent Workflow Runs       │
│           Data Table              │
└───────────────────────────────────┘
```

### **Key Metrics to Track**
- 📊 **Execution Volume**: Daily/hourly workflow runs
- ✅ **Success Rate**: Percentage of successful executions
- ⏱️ **Performance**: Average execution duration
- 🚨 **Error Rate**: Failed executions by type
- 👥 **User Activity**: Active users and workflow creation
- 🔧 **System Health**: Database performance metrics

---

## 🚀 Next Steps

1. **Start with DBeaver** for immediate data exploration
2. **Use provided SQL queries** to understand your data patterns
3. **Set up Grafana** for real-time monitoring dashboards
4. **Create custom queries** based on your specific needs
5. **Export data** for external analysis tools if needed

**The workflow engine generates rich execution data perfect for analytics and monitoring!**