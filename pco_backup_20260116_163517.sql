--
-- PostgreSQL database dump
--

\restrict gEmEaz5fp0W6p8xdXDnKzMGjbdFJBr2naubzscwn4KnWAPhfOj4EgPXRUrkRc7v

-- Dumped from database version 15.15 (Debian 15.15-1.pgdg13+1)
-- Dumped by pg_dump version 15.15 (Debian 15.15-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: CheckoutStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CheckoutStatus" AS ENUM (
    'requested',
    'approved',
    'ready',
    'issued'
);


--
-- Name: ProductBehavior; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductBehavior" AS ENUM (
    'CONSUMABLE',
    'NONCONSUMABLE',
    'REGULATED_CUSTOMER_BOUND'
);


--
-- Name: ProductCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductCategory" AS ENUM (
    'CHEMICAL',
    'EQUIPMENT',
    'PPE',
    'OTHER'
);


--
-- Name: ReceiptStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ReceiptStatus" AS ENUM (
    'draft',
    'posted'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'ADMIN',
    'MANAGER',
    'WAREHOUSE',
    'TECH'
);


--
-- Name: TransactionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TransactionType" AS ENUM (
    'initial_load',
    'receiving_posted',
    'checkout_requested',
    'checkout_finalized',
    'adjustment',
    'audit_count',
    'checkin_return',
    'transfer'
);


--
-- Name: TransferDirection; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TransferDirection" AS ENUM (
    'ISSUE',
    'RETURN'
);


--
-- Name: TransferRequestStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TransferRequestStatus" AS ENUM (
    'OPEN',
    'SUBMITTED',
    'FINALIZED',
    'ACK_PENDING',
    'ACKNOWLEDGED',
    'REJECTED',
    'CANCELED',
    'DISPUTED'
);


--
-- Name: UnitBaseType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UnitBaseType" AS ENUM (
    'MASS',
    'VOLUME',
    'COUNT'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: CheckoutLine; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CheckoutLine" (
    id text NOT NULL,
    "requestId" text NOT NULL,
    "productId" text NOT NULL,
    "qtyRequested" integer NOT NULL,
    "qtyIssued" integer,
    "checkoutUnitLabel" text NOT NULL,
    "totalBaseQuantity" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: CheckoutRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CheckoutRequest" (
    id text NOT NULL,
    "requestDate" timestamp(3) without time zone NOT NULL,
    status public."CheckoutStatus" DEFAULT 'requested'::public."CheckoutStatus" NOT NULL,
    "technicianId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "readyById" text
);


--
-- Name: IncomingLine; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."IncomingLine" (
    id text NOT NULL,
    "receiptId" text NOT NULL,
    "productId" text NOT NULL,
    "qtyOrdered" integer NOT NULL,
    "qtyReceived" integer NOT NULL,
    "backorderedQty" integer NOT NULL,
    "receivingUnitLabel" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: IncomingReceipt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."IncomingReceipt" (
    id text NOT NULL,
    "receiptDate" timestamp(3) without time zone NOT NULL,
    supplier text,
    status public."ReceiptStatus" DEFAULT 'draft'::public."ReceiptStatus" NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "postedAt" timestamp(3) without time zone
);


--
-- Name: InventoryBalance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventoryBalance" (
    "productId" text NOT NULL,
    "onHandBase" integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    id text NOT NULL,
    scope text DEFAULT 'WAREHOUSE'::text NOT NULL
);


--
-- Name: InventoryTransaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventoryTransaction" (
    id text NOT NULL,
    "productId" text NOT NULL,
    type public."TransactionType" NOT NULL,
    "quantityBase" integer NOT NULL,
    "beforeBase" integer NOT NULL,
    "afterBase" integer NOT NULL,
    "actorId" text,
    "actorRole" public."Role",
    device text,
    reason text,
    "idempotencyKey" text NOT NULL,
    "incomingLineId" text,
    "checkoutLineId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    comment text,
    scope text DEFAULT 'WAREHOUSE'::text NOT NULL,
    "transferGroupId" text,
    "transferIdempotencyKey" text
);


--
-- Name: Notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Notification" (
    id text NOT NULL,
    "userId" text NOT NULL,
    message text NOT NULL,
    type text NOT NULL,
    "readAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Product" (
    id text NOT NULL,
    name text NOT NULL,
    "epaRegNo" text,
    description text,
    category public."ProductCategory" DEFAULT 'CHEMICAL'::public."ProductCategory" NOT NULL,
    "baseType" public."UnitBaseType" NOT NULL,
    "trackingUnitLabel" text NOT NULL,
    "checkoutUnitLabel" text NOT NULL,
    "orderingUnitLabel" text NOT NULL,
    "trackingToBase" integer NOT NULL,
    "checkoutToBase" integer NOT NULL,
    "orderingToBase" integer NOT NULL,
    "reorderLevelBase" integer,
    "quantityInReorder" integer,
    "leadTimeDays" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "isDiscontinued" boolean DEFAULT false NOT NULL,
    "isStocked" boolean DEFAULT true NOT NULL,
    behavior public."ProductBehavior" DEFAULT 'CONSUMABLE'::public."ProductBehavior" NOT NULL
);


--
-- Name: ProductCode; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProductCode" (
    id text NOT NULL,
    "productId" text NOT NULL,
    "packId" text,
    "codeType" text NOT NULL,
    payload text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ProductPack; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProductPack" (
    id text NOT NULL,
    "productId" text NOT NULL,
    name text NOT NULL,
    "quantityPerPack" integer NOT NULL,
    "orderingToBase" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ReasonCode; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReasonCode" (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: ReorderPolicy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReorderPolicy" (
    id text NOT NULL,
    "productId" text NOT NULL,
    "reorderLevelBase" integer NOT NULL,
    "targetDaysOfSupply" integer,
    supplier text,
    "leadTimeDays" integer,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Setting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Setting" (
    key text NOT NULL,
    value text NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Technician; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Technician" (
    id text NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: TransferRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TransferRequest" (
    id text DEFAULT gen_random_uuid() NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdByUserId" text NOT NULL,
    "technicianId" text NOT NULL,
    direction public."TransferDirection" NOT NULL,
    "fromScope" text NOT NULL,
    "toScope" text NOT NULL,
    status public."TransferRequestStatus" DEFAULT 'SUBMITTED'::public."TransferRequestStatus" NOT NULL,
    reason text,
    "submittedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finalizedAt" timestamp(3) without time zone,
    "finalizedByUserId" text,
    "acknowledgedAt" timestamp(3) without time zone,
    "acknowledgedByUserId" text,
    "disputeNote" text,
    "requestIdempotencyKey" text
);


--
-- Name: TransferRequestLine; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TransferRequestLine" (
    id text DEFAULT gen_random_uuid() NOT NULL,
    "transferRequestId" text NOT NULL,
    "productId" text NOT NULL,
    quantity double precision NOT NULL,
    "unitLabel" text NOT NULL
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    role public."Role" NOT NULL,
    location text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "passwordHash" text NOT NULL,
    "technicianId" text,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Data for Name: CheckoutLine; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."CheckoutLine" (id, "requestId", "productId", "qtyRequested", "qtyIssued", "checkoutUnitLabel", "totalBaseQuantity", "createdAt") FROM stdin;
\.


--
-- Data for Name: CheckoutRequest; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."CheckoutRequest" (id, "requestDate", status, "technicianId", "createdAt", "updatedAt", "readyById") FROM stdin;
\.


--
-- Data for Name: IncomingLine; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."IncomingLine" (id, "receiptId", "productId", "qtyOrdered", "qtyReceived", "backorderedQty", "receivingUnitLabel", "createdAt") FROM stdin;
\.


--
-- Data for Name: IncomingReceipt; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."IncomingReceipt" (id, "receiptDate", supplier, status, "createdById", "createdAt", "postedAt") FROM stdin;
\.


--
-- Data for Name: InventoryBalance; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InventoryBalance" ("productId", "onHandBase", "updatedAt", id, scope) FROM stdin;
cmjqno01m0006my1se4whmz7o	2	2026-01-01 14:49:25.988	95200317-6c29-472e-96cd-d0f4efb795e4	WAREHOUSE
cmjqno030000imy1syend3obx	1	2026-01-01 14:49:26.001	76c8b75d-f6fc-4363-923e-e6ff39050f61	WAREHOUSE
cmjqno03y000rmy1skec7bs6p	6	2026-01-01 14:49:26.012	52456303-6251-45b3-9419-3a297640fd81	WAREHOUSE
cmjqno046000umy1s8v95c9sw	9	2026-01-01 14:49:26.023	13cac48e-ed8a-487b-a359-a7e2e117be06	WAREHOUSE
cmjqno04n0010my1scsfh2nch	22	2026-01-01 14:49:26.033	8f09607a-7ff4-44df-b789-309bc4c2e0ee	WAREHOUSE
cmjqno04v0013my1spw3wcttr	4	2026-01-01 14:49:26.044	237c665c-126c-4120-9f03-0c595589cdbc	WAREHOUSE
cmjqno05b0019my1sv2rk9tvp	2	2026-01-01 14:49:26.066	08817478-741a-47f0-bd13-14c4f7e39bfb	WAREHOUSE
cmjqno05j001cmy1s4pv84e47	4	2026-01-01 14:49:26.075	79d9f8c1-037f-4ec6-bb6d-d02318f85bb0	WAREHOUSE
cmjqno060001imy1snk2z9gvn	5	2026-01-01 14:49:26.094	459d6fe0-ab15-4bf8-b909-8168eb38e3e7	WAREHOUSE
cmjqno06a001lmy1srgs7s1yw	496	2026-01-01 14:49:26.103	e083d387-6ccb-411f-9370-3215f562204c	WAREHOUSE
cmjqno06n001omy1s7bby80hv	11	2026-01-01 14:49:26.113	ab8adffa-f233-4bb0-bb6e-cfa4ddbafde8	WAREHOUSE
cmjqno076001umy1soz0adsum	100	2026-01-01 14:49:26.124	17ec8361-0c38-44fc-adfb-31fbafc38c58	WAREHOUSE
cmjqno07g001xmy1s9woks2tb	3	2026-01-01 14:49:26.134	fa01f8c0-0361-4990-89ee-0cc203c3a677	WAREHOUSE
cmjqno07n0020my1s3zlg5f9v	5	2026-01-01 14:49:26.144	b8da9280-a835-4c9d-b8b5-718cc2e73e79	WAREHOUSE
cmjqno07v0023my1s0wfqtql2	3102	2026-01-01 14:49:26.154	61c4aa4a-0b50-4cc7-b94a-04b6ffef8ba3	WAREHOUSE
cmjqno0820026my1sja4mh5sf	1	2026-01-01 14:49:26.165	1c91bbc1-616e-4dc3-9c1b-1844f3f8e08d	WAREHOUSE
cmjqno08i002cmy1sgfs513js	27	2026-01-01 14:49:26.174	8de4e922-fc40-49f7-b004-40996f4203ec	WAREHOUSE
cmjqno08p002fmy1sn2qzzkcc	4	2026-01-01 14:49:26.184	b3f0fb70-cb53-4388-b0a8-520e776ff7b8	WAREHOUSE
cmjqno08x002imy1s1or9o4uv	6	2026-01-01 14:49:26.194	b50ac164-a889-426b-a986-7c12f74ed74c	WAREHOUSE
cmjqno094002lmy1sles9c8k6	4	2026-01-01 14:49:26.204	8482dc87-ff34-454f-a541-4b51cb20af39	WAREHOUSE
cmjqno09d002omy1sq0fjefql	60	2026-01-01 14:49:26.214	4c8dbd41-9dfa-49ad-9d2b-51b1c3ac3da3	WAREHOUSE
cmjqno09m002rmy1sytcvzck9	72	2026-01-01 14:49:26.223	80cbd076-6c94-4671-9496-b9d526c7a6f6	WAREHOUSE
cmjqno09w002umy1s00enpdc7	5	2026-01-01 14:49:26.233	8a5c4e5a-883e-4411-ab90-fb58478d287e	WAREHOUSE
cmjqno0ao0033my1scpwf168s	3744	2026-01-01 14:49:26.253	f4a21b48-6169-4e8f-a757-55443c0ee447	WAREHOUSE
cmjqno0av0036my1sdzetzen5	4	2026-01-01 14:49:26.263	77176d6c-ca8f-4a90-94fb-aba22cfe4438	WAREHOUSE
cmjqno0bb003cmy1s5vlnwb2b	50	2026-01-01 14:49:26.273	e6b74a46-af1e-4cb5-a156-2bdb18d7413d	WAREHOUSE
cmjqno0bi003fmy1smhbzdcic	5	2026-01-01 14:49:26.282	efc283e2-45b9-41ce-8802-ee3db7dbf80a	WAREHOUSE
cmjqno0br003imy1sewdy2nmy	1	2026-01-01 14:49:26.291	a4309d89-13ca-48ed-aa29-1ffc8b2f30ea	WAREHOUSE
cmjqno0by003lmy1sdo6l0uij	3	2026-01-01 14:49:26.299	f2057df4-3394-4716-a160-b7dce29b7aac	WAREHOUSE
cmjqno0c6003omy1s30ilmfqx	15	2026-01-01 14:49:26.308	fb388b83-158e-4f2c-9aca-2a8042f688fd	WAREHOUSE
cmjqno0cd003rmy1skt761jdm	2	2026-01-01 14:49:26.318	7a7ad9dc-17f3-4edb-a11e-9ddca0d0984c	WAREHOUSE
cmjqno0ct003xmy1s46smdyjj	13	2026-01-01 14:49:26.327	df2b848f-049f-48fa-9080-244a09384336	WAREHOUSE
cmjqno0d20040my1s4g0k07an	1	2026-01-01 14:49:26.337	b16e47c9-0c4a-4501-a05e-9b667e959cdf	WAREHOUSE
cmjqno0d90043my1sgrf6ig0d	32	2026-01-01 14:49:26.347	8499a083-22a3-46a5-9fdf-b2a4a4f85e0e	WAREHOUSE
cmjqno0di0046my1svbuvyzws	3	2026-01-01 14:49:26.356	b1400cd9-0592-434a-a781-46e0ad80c484	WAREHOUSE
cmjqno0dr0049my1sq04c53cj	7	2026-01-01 14:49:26.367	c5a03709-60c7-4fbd-b1b0-06cf0570106d	WAREHOUSE
cmjqno0e8004fmy1s0gnyi973	2	2026-01-01 14:49:26.377	3a9a9612-9894-4291-beb4-b69fec2274b3	WAREHOUSE
cmjqno0em004lmy1slmr9pgii	4	2026-01-01 14:49:26.388	e8c6209b-f70c-44c0-b44f-58df8f1e62ef	WAREHOUSE
cmjqno0f1004rmy1s5wbbunlh	1	2026-01-01 14:49:26.397	446738fd-1daa-4f1b-bc06-01df78f14a28	WAREHOUSE
cmjqno0fh004xmy1smriqpt1u	12	2026-01-01 14:49:26.406	d217e338-8d4f-42a8-aa1e-8e2a0fadfbda	WAREHOUSE
cmjqno0fp0050my1s5y7d3hu3	84	2026-01-01 14:49:26.416	80ac96b5-e14c-4243-8edb-27b4f9cea610	WAREHOUSE
cmjqno0g50056my1su9itk4oy	76	2026-01-01 14:49:26.425	2ec9b53a-5e02-4025-af31-dfe95d9f0e42	WAREHOUSE
cmjqno0gb0059my1selmdlw9f	71	2026-01-01 14:49:26.434	eec2e4d4-59ed-4886-9862-f8a39c0477ec	WAREHOUSE
cmjqno0gj005cmy1s73agplxo	438	2026-01-01 14:49:26.443	1daa158c-294b-4473-8cc9-7de6b8482afa	WAREHOUSE
cmjqno0gr005fmy1sd74rsayv	17	2026-01-01 14:49:26.454	712340be-3992-4122-bbb5-c29d304e347b	WAREHOUSE
cmjqno0gz005imy1scpgoy62p	4	2026-01-01 14:49:26.462	b3172896-1100-4325-b8e5-2b5ac116073f	WAREHOUSE
cmjqno0i7005umy1si0086cg7	12	2026-01-01 14:49:26.473	f1b56241-028f-4bbf-81b6-63fe8cfe4f35	WAREHOUSE
cmjqno0ij005xmy1s7c00z7ji	4	2026-01-01 14:49:26.482	4b1606fd-7624-43f4-81fc-67567289bc79	WAREHOUSE
cmjqno0is0060my1skgsod4h2	9	2026-01-01 14:49:26.491	dd7940cb-51d7-4480-93ac-89a1947fe288	WAREHOUSE
cmjqno0j10063my1szgnd805t	2	2026-01-01 14:49:26.502	0e00d20e-1953-457e-bc75-16d4d8c05c89	WAREHOUSE
cmjqno0jh0069my1sempl6rib	5	2026-01-01 14:49:26.512	8b428513-2d9c-40b3-8dd6-e74c6fb07cdf	WAREHOUSE
cmjqno0jo006cmy1so4kx7b3s	7	2026-01-01 14:49:26.522	d30ee2d5-5298-4824-af36-a8bd1d3b5ff1	WAREHOUSE
cmjqno0jw006fmy1sclgmauk3	6	2026-01-01 14:49:26.531	e3e54cf3-5589-4b8c-927d-8c8cb54be959	WAREHOUSE
cmjqno0k4006imy1s6o3yfzu9	90	2026-01-01 14:49:26.54	b9127687-d097-4c9d-adc7-d66c7fffefc2	WAREHOUSE
cmjqno0kl006omy1sj6jkutct	8	2026-01-01 14:49:26.549	9c28144c-d6eb-4052-a6dc-c3625e08183c	WAREHOUSE
cmjqno0l2006umy1sp70ne45r	128	2026-01-01 14:49:26.558	b648de32-7a2d-4657-9a3e-51f8e4691ff8	WAREHOUSE
cmjqno0lc006xmy1suz1u2ve2	512	2026-01-01 14:49:26.567	85b3eeb3-0912-4d55-a18e-9c08a2f7c360	WAREHOUSE
cmjqno0ll0070my1snl8s6v8n	92	2026-01-01 14:49:26.576	3f158da9-c2e1-40d3-8d00-6ba96b4364d6	WAREHOUSE
cmjqno0lu0073my1sddkfv8er	2	2026-01-01 14:49:26.587	bdb628b5-6eb2-460a-b7b0-45bf102e255f	WAREHOUSE
cmjqno0ma0079my1sfrw1wbda	88	2026-01-01 14:49:26.595	a48b963b-1903-44b7-aa2a-f3fb8bd2d26f	WAREHOUSE
cmjqno0mk007cmy1syudhfgey	50	2026-01-01 14:49:26.606	3d790db0-bcb1-4536-9db3-ea77902a82f5	WAREHOUSE
cmjqno0mt007fmy1sct2eaqw2	1	2026-01-01 14:49:26.618	2c7250b3-240c-4416-8bff-81705c721fda	WAREHOUSE
cmjqno0n3007imy1s7xoebaru	4	2026-01-01 14:49:26.627	62528d10-1685-40ed-9f2e-344a6630ef3a	WAREHOUSE
cmjqno0nd007lmy1sommwbphf	1057	2026-01-01 14:49:26.636	39494c31-9060-4d13-a055-372d1f05d90d	WAREHOUSE
cmjqno0nn007omy1sivxf04xk	6	2026-01-01 14:49:26.647	f4f1e192-1de7-4b34-ab10-43c9dc511e68	WAREHOUSE
cmjqno0nw007rmy1s8ar2ddx8	1	2026-01-01 14:49:26.655	201c918f-851d-4863-bb2e-be66f03c8989	WAREHOUSE
cmjqno0o6007umy1s4uscg5f2	1	2026-01-01 14:49:26.664	cfb60f38-52e8-4006-98a6-fe9325abd65a	WAREHOUSE
cmjqno0og007xmy1sv6bfshg5	6	2026-01-01 14:49:26.673	f94f5105-22da-4fac-a2b0-1fe034e19ddc	WAREHOUSE
cmjqno0oy0083my1sh5sc3472	3	2026-01-01 14:49:26.682	06619c7e-feca-47b7-ba14-1d38f2763f40	WAREHOUSE
cmjqno0p60086my1so5ozbrnt	26	2026-01-01 14:49:26.69	a400f364-b801-4a62-a9c0-470bfd83f009	WAREHOUSE
cmjqno0a5002xmy1sw2hlsnke	8	2026-01-15 21:32:08.661	db9268a1-5ba9-4de8-aa06-b23eb4394724	WAREHOUSE
cmjqno0530016my1sj6kd05or	-1	2026-01-16 01:12:21.038	cfb03717-3475-4734-81ff-0d6e19343e0f	WAREHOUSE
cmjqno05s001fmy1smzuq969d	3	2026-01-16 01:19:31.75	59175fce-29b7-4423-b8b8-f526f1f1c44a	WAREHOUSE
cmjqno0pf0089my1snnk797ip	11	2026-01-01 14:49:26.701	15b6daf7-bc00-428b-93ee-676df8fc6b75	WAREHOUSE
cmjqno0qe008lmy1sw3xkbogz	2	2026-01-01 14:49:26.709	03db3243-d3ed-4a46-91af-ca64b3aa7a19	WAREHOUSE
cmjqno0qo008omy1shg16tl9x	2	2026-01-01 14:49:26.718	50ddf4c0-3c43-4110-9e85-bace1da8a8d1	WAREHOUSE
cmjqno0r1008rmy1sjqfzphz0	143	2026-01-01 14:49:26.727	48d4cbf8-a378-482c-85b0-a61d64c85761	WAREHOUSE
cmjqno0rd008umy1snu2dwolv	4	2026-01-01 14:49:26.736	58636d40-2893-4c14-83a8-78161aedb402	WAREHOUSE
cmjqno0s20093my1s1oje6uem	2	2026-01-01 14:49:26.749	1a154f77-65d9-48da-a7f0-12772e93937a	WAREHOUSE
cmjqno0sm0099my1s1ka0cdob	1	2026-01-01 14:49:26.758	cd837e73-e885-4649-b949-03532f1c7bf2	WAREHOUSE
cmjqno0sv009cmy1srkhog05k	3	2026-01-01 14:49:26.767	f7ea162e-da6e-4123-b8fe-620df8d46eba	WAREHOUSE
cmjqno0t5009fmy1sf6e88t53	10	2026-01-01 14:49:26.777	2194297c-0de8-4190-a905-f26ddcc56fe6	WAREHOUSE
cmjqno0te009imy1soh67goun	1	2026-01-01 14:49:26.787	b67549b7-2e6c-4ab1-8aa9-38c303964421	WAREHOUSE
cmjqno0tp009lmy1souhdrd5p	8	2026-01-01 14:49:26.797	e696c436-7fdc-4113-8b95-c34c7b0f5e0c	WAREHOUSE
cmjqno0u1009omy1sbndrfd68	20	2026-01-01 14:49:26.805	3bcd70cb-be26-412c-bf51-d0a3b11fc596	WAREHOUSE
cmjqno0v8009xmy1sudlemhvd	2	2026-01-01 14:49:26.814	129d33dc-c78a-4445-b649-41af92a9909f	WAREHOUSE
cmjqno0vl00a0my1s27wjda95	45	2026-01-01 14:49:26.825	fa7eff93-14f0-4ae0-8666-565ea59cf983	WAREHOUSE
cmjqno0vw00a3my1s2emzbm8i	3	2026-01-01 14:49:26.835	0ba49d58-5f4c-49ee-9763-f8b6edbfe8e2	WAREHOUSE
cmjqno0w700a6my1sth1rs7tf	9	2026-01-01 14:49:26.845	26d831d1-26d5-43d9-a2a6-fa1e2bfea76a	WAREHOUSE
cmjqno0wh00a9my1szcwdds1t	5	2026-01-01 14:49:26.855	998f80a6-ae80-42ae-bb87-219674a2db24	WAREHOUSE
cmjqno0wr00acmy1s1jw9cdmu	3	2026-01-01 14:49:26.867	a4a8d972-ffaa-4001-870c-173f3a248877	WAREHOUSE
cmjqno0x100afmy1sonxakg5h	1	2026-01-01 14:49:26.876	0c26d086-7e66-4871-9114-68a9a25181a9	WAREHOUSE
cmjqno0xa00aimy1stqgf2jii	5	2026-01-01 14:49:26.885	051321b1-b846-412d-9bfc-2d5199d63e08	WAREHOUSE
cmjqno0xk00almy1sp55aujm8	435	2026-01-01 14:49:26.893	3b36dccf-5c95-4987-b979-893dd7736ea6	WAREHOUSE
cmjqno0y600army1sbh7m6ovr	17	2026-01-01 14:49:26.902	377dcc59-a98a-420b-b5e5-185a9fa8730f	WAREHOUSE
cmjqno0yh00aumy1s1a6yjbyh	3	2026-01-01 14:49:26.91	9801fe47-43dd-4dfa-8361-15a3ef62afeb	WAREHOUSE
cmjqno0ys00axmy1ssln3ovlx	6	2026-01-01 14:49:26.919	8cd4fd6a-e59d-4e77-ae99-ec45eeea1853	WAREHOUSE
cmjqno0z200b0my1sncqj50i2	6	2026-01-01 14:49:26.927	d792ca4a-233f-42d2-bb6d-23708a63bb3a	WAREHOUSE
cmjqno0zc00b3my1srzljm87d	4	2026-01-01 14:49:26.936	36323816-7c7b-4c54-b58e-e9d397d5cf0f	WAREHOUSE
cmjqno0zm00b6my1s96d0wu71	1	2026-01-01 14:49:26.944	cc9648fd-468b-408e-8986-649a05c8ed46	WAREHOUSE
cmjqno10c00bcmy1sh38bn45k	3	2026-01-01 14:49:26.953	6f618b2f-7451-4863-ace6-76458f12585f	WAREHOUSE
cmjqno10q00bfmy1sqekllt8x	1	2026-01-01 14:49:26.961	cfd551e6-1dda-4bb7-9ed2-a12060090504	WAREHOUSE
cmjqno11g00blmy1s6ec9f42t	7	2026-01-01 14:49:26.97	80d9bb76-ae86-4e64-b0ae-18d2a12876b5	WAREHOUSE
cmjqno11r00bomy1s19u54qds	8	2026-01-01 14:49:26.979	600b50e9-746e-4300-8b60-06f340c69255	WAREHOUSE
cmjqno12400brmy1sx4sgzddj	1	2026-01-01 14:49:26.989	bcda3491-6e3f-4d95-81f6-f16730e44ae5	WAREHOUSE
cmjqno12j00bumy1sgwyurrgi	80	2026-01-01 14:49:26.997	3d1a6255-92b9-4cf4-aa6d-9f011011bfac	WAREHOUSE
cmjqno13b00c3my1s5ert0nt9	2	2026-01-01 14:49:27.005	e2f3663d-aa31-4799-a954-8805198edcea	WAREHOUSE
cmjqno13n00c6my1so8d0z9yf	3	2026-01-01 14:49:27.013	a66f7822-bf66-47b0-b652-2ef24c6506df	WAREHOUSE
cmjqno13v00c9my1squ8yho5w	170	2026-01-01 14:49:27.022	5b489e43-7243-4c0d-86b2-997a51904c9c	WAREHOUSE
cmjqno14900ccmy1su0x83h4x	5	2026-01-01 14:49:27.03	7340434d-e0da-4345-b948-0462d2af7d1f	WAREHOUSE
cmjqno14k00cfmy1syhhalf4v	3	2026-01-01 14:49:27.039	b0193e6e-6d15-4c96-b0e9-75f5ba098d5c	WAREHOUSE
cmjqno14u00cimy1s0t8teld0	1	2026-01-01 14:49:27.049	4dc55124-67ff-4c9b-a723-8569fd150c91	WAREHOUSE
cmjqno16900cxmy1sy2ouy747	1	2026-01-01 14:49:27.073	b227a64d-a1e9-4288-9da5-b9527e9b5b08	WAREHOUSE
cmjqno16t00d3my1s3ewn4962	4	2026-01-01 14:49:27.085	7498e26a-91fb-4b09-9d5c-ad04ba6e27a7	WAREHOUSE
cmjqno17200d6my1sgc8ncg32	6	2026-01-01 14:49:27.097	2e67511d-c76f-4d24-b9c0-9d7e34553f6a	WAREHOUSE
cmjqno17e00d9my1sfjhb5s81	1	2026-01-01 14:49:27.107	fb3f1cd5-4ce5-4bdf-9a32-801e7aacf333	WAREHOUSE
cmjqno18500dimy1scfaje3wm	7	2026-01-01 14:49:27.128	6ef12be2-e6fb-471a-a095-fca8bdb06d9e	WAREHOUSE
cmjqno18j00dlmy1s5zqejdux	5	2026-01-01 14:49:27.139	8e45020f-f921-4216-965e-ce781f1ea77a	WAREHOUSE
cmjqno18t00domy1sa4tj7ci9	25	2026-01-01 14:49:27.15	4aa0d6a8-22bc-4b3f-b785-5710be5a4db3	WAREHOUSE
cmjqno19500drmy1s036dacsx	3	2026-01-01 14:49:27.161	d4047e00-b503-4395-86ee-9a5b76839108	WAREHOUSE
cmjqno1a000e0my1sr7dx4st1	67	2026-01-01 14:49:27.172	80928c68-0e90-4563-a3a3-5819d6c9dc42	WAREHOUSE
cmjqno1aa00e3my1s8kw7r7wv	77	2026-01-01 14:49:27.183	8879196a-8cc9-40ea-92a5-d5e670682a77	WAREHOUSE
cmjqno1al00e6my1ssw77rzcz	70	2026-01-01 14:49:27.195	011b465f-4231-4c90-8404-0ef56a24cfbf	WAREHOUSE
cmjqno1ax00e9my1s6dopbdg0	30	2026-01-01 14:49:27.209	353c1a98-48a8-4fcd-992b-33410639c1fb	WAREHOUSE
cmjqno1b800ecmy1she42kf0u	1	2026-01-01 14:49:27.223	ba124d38-dc24-4a99-81c0-eb46bfd8ed91	WAREHOUSE
cmjqno1cn00eomy1shevfrmyd	6	2026-01-01 14:49:27.251	e1ea30f0-6c02-4fc6-b064-754f24675831	WAREHOUSE
cmjqno1cy00ermy1s9pfpqctx	72	2026-01-01 14:49:27.264	b62f07ad-21a2-48fe-9b75-3f218a574ee3	WAREHOUSE
cmjqno1di00exmy1s3vue6xga	256	2026-01-01 14:49:27.276	35f002a1-b9c5-495a-ba61-1c2d4a698822	WAREHOUSE
cmjqno1e300f3my1s6pkjbbn2	3	2026-01-01 14:49:27.298	5ab1d8d1-34c2-4c56-8624-f9bcce253008	WAREHOUSE
cmjqno1ee00f6my1scfrgo4d2	19	2026-01-01 14:49:27.309	740a8039-ae45-4077-ab0e-f7232eb81dcd	WAREHOUSE
cmjqno1ep00f9my1s9e5cj5ry	1	2026-01-01 14:49:27.32	cbc1bc6e-2ace-4401-ab19-2eeef762e287	WAREHOUSE
cmjqno1d900eumy1sr37sqnar	0	2026-01-01 21:19:22.872	1684567a-aa13-4370-8a07-e354a3c4f23c	WAREHOUSE
cmjqno1dr00f0my1sjl6j3a9v	15	2026-01-02 05:08:06.295	003495f1-a8cd-41e7-b9d8-05811db8d235	WAREHOUSE
cmjqno1dr00f0my1sjl6j3a9v	1	2026-01-02 05:08:06.296	cmjwexurz0004umacvvse8a1w	TRUCK:cmjwe4b7e0001p4nzqq3ithwo
cmjqno0030000my1sprl3ajh9	-1	2026-01-15 11:11:08.41	31d36797-ea1a-40a2-aabf-bb0cf00a34c0	WAREHOUSE
cmjqno0030000my1sprl3ajh9	2	2026-01-15 11:11:08.412	cmk1yj0i50009rq89da2ysm2p	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5
cmjqno15d00comy1s14i2k5hw	13	2026-01-15 11:11:08.42	5b045733-09d5-41ad-a82d-b8111446b56b	WAREHOUSE
cmjqno15d00comy1s14i2k5hw	1	2026-01-15 11:11:08.42	cmkfcmsn3000hrf7ztll47140	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5
cmjqno17w00dfmy1syh7ullcf	3	2026-01-15 21:32:08.645	79deb09e-d716-476e-9400-de263d2be421	WAREHOUSE
cmjqno17w00dfmy1syh7ullcf	1	2026-01-15 21:32:08.648	cmkfytet70009xhkc6zio4sw6	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5
cmjqno1ce00elmy1s7ayiz0yw	20	2026-01-16 01:06:19.164	99e70bf9-fca1-4a61-8234-5f327ff3b01a	WAREHOUSE
cmjqno0180003my1slmqx61lk	9	2026-01-16 01:06:23.739	ab5044cc-d756-40bc-8c2d-5c99fc51f82a	WAREHOUSE
cmjqno0180003my1slmqx61lk	2	2026-01-16 01:06:23.739	cmk1yj0im000hrq892v0g3veu	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5
cmjqno0a5002xmy1sw2hlsnke	1	2026-01-15 21:32:08.662	cmkfytetq000hxhkcsnv2ibl0	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5
cmjqno1ce00elmy1s7ayiz0yw	1	2026-01-16 01:06:19.165	cmkg6guc7000o12cnc26l257j	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5
cmjqno0530016my1sj6kd05or	2	2026-01-16 01:12:21.039	cmkg6guc0000g12cn3w802nv2	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5
cmjqno05s001fmy1smzuq969d	2	2026-01-16 01:19:31.751	cmkg6gubn000812cnlf5rneqt	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5
\.


--
-- Data for Name: InventoryTransaction; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InventoryTransaction" (id, "productId", type, "quantityBase", "beforeBase", "afterBase", "actorId", "actorRole", device, reason, "idempotencyKey", "incomingLineId", "checkoutLineId", "createdAt", comment, scope, "transferGroupId", "transferIdempotencyKey") FROM stdin;
cmjvk9lfb0002v0x8d52osak8	cmjqno0030000my1sprl3ajh9	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0030000my1sprl3ajh9:v1	\N	\N	2026-01-01 14:49:25.943	\N	WAREHOUSE	\N	\N
cmjvk9lg40005v0x8bf3p209u	cmjqno0180003my1slmqx61lk	initial_load	11	0	11	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0180003my1slmqx61lk:v1	\N	\N	2026-01-01 14:49:25.972	\N	WAREHOUSE	\N	\N
cmjvk9lgi0008v0x8gr56a097	cmjqno01m0006my1se4whmz7o	initial_load	2	0	2	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno01m0006my1se4whmz7o:v1	\N	\N	2026-01-01 14:49:25.987	\N	WAREHOUSE	\N	\N
cmjvk9lgv000bv0x8o0wt8312	cmjqno030000imy1syend3obx	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno030000imy1syend3obx:v1	\N	\N	2026-01-01 14:49:26	\N	WAREHOUSE	\N	\N
cmjvk9lh6000ev0x8u1m386oz	cmjqno03y000rmy1skec7bs6p	initial_load	6	0	6	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno03y000rmy1skec7bs6p:v1	\N	\N	2026-01-01 14:49:26.01	\N	WAREHOUSE	\N	\N
cmjvk9lhh000hv0x8yt3wjx1b	cmjqno046000umy1s8v95c9sw	initial_load	9	0	9	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno046000umy1s8v95c9sw:v1	\N	\N	2026-01-01 14:49:26.022	\N	WAREHOUSE	\N	\N
cmjvk9lhs000kv0x811kw7tkh	cmjqno04n0010my1scsfh2nch	initial_load	22	0	22	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno04n0010my1scsfh2nch:v1	\N	\N	2026-01-01 14:49:26.032	\N	WAREHOUSE	\N	\N
cmjvk9li2000nv0x8uwzp8qfk	cmjqno04v0013my1spw3wcttr	initial_load	4	0	4	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno04v0013my1spw3wcttr:v1	\N	\N	2026-01-01 14:49:26.042	\N	WAREHOUSE	\N	\N
cmjvk9lif000qv0x8ffatsyll	cmjqno0530016my1sj6kd05or	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0530016my1sj6kd05or:v1	\N	\N	2026-01-01 14:49:26.055	\N	WAREHOUSE	\N	\N
cmjvk9lio000tv0x87urlzdol	cmjqno05b0019my1sv2rk9tvp	initial_load	2	0	2	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno05b0019my1sv2rk9tvp:v1	\N	\N	2026-01-01 14:49:26.065	\N	WAREHOUSE	\N	\N
cmjvk9liy000wv0x8ll5fqdth	cmjqno05j001cmy1s4pv84e47	initial_load	4	0	4	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno05j001cmy1s4pv84e47:v1	\N	\N	2026-01-01 14:49:26.074	\N	WAREHOUSE	\N	\N
cmjvk9lj7000zv0x8zt7oak17	cmjqno05s001fmy1smzuq969d	initial_load	5	0	5	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno05s001fmy1smzuq969d:v1	\N	\N	2026-01-01 14:49:26.083	\N	WAREHOUSE	\N	\N
cmjvk9ljg0012v0x8hly6lbqm	cmjqno060001imy1snk2z9gvn	initial_load	5	0	5	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno060001imy1snk2z9gvn:v1	\N	\N	2026-01-01 14:49:26.093	\N	WAREHOUSE	\N	\N
cmjvk9ljp0015v0x8wfrx70dj	cmjqno06a001lmy1srgs7s1yw	initial_load	496	0	496	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno06a001lmy1srgs7s1yw:v1	\N	\N	2026-01-01 14:49:26.102	\N	WAREHOUSE	\N	\N
cmjvk9ljz0018v0x88qpkoybe	cmjqno06n001omy1s7bby80hv	initial_load	11	0	11	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno06n001omy1s7bby80hv:v1	\N	\N	2026-01-01 14:49:26.111	\N	WAREHOUSE	\N	\N
cmjvk9lka001bv0x822ur51sa	cmjqno076001umy1soz0adsum	initial_load	100	0	100	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno076001umy1soz0adsum:v1	\N	\N	2026-01-01 14:49:26.122	\N	WAREHOUSE	\N	\N
cmjvk9lkl001ev0x8xftqr6xz	cmjqno07g001xmy1s9woks2tb	initial_load	3	0	3	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno07g001xmy1s9woks2tb:v1	\N	\N	2026-01-01 14:49:26.133	\N	WAREHOUSE	\N	\N
cmjvk9lkv001hv0x8kaczpx6e	cmjqno07n0020my1s3zlg5f9v	initial_load	5	0	5	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno07n0020my1s3zlg5f9v:v1	\N	\N	2026-01-01 14:49:26.143	\N	WAREHOUSE	\N	\N
cmjvk9ll5001kv0x8iodisb5a	cmjqno07v0023my1s0wfqtql2	initial_load	3102	0	3102	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno07v0023my1s0wfqtql2:v1	\N	\N	2026-01-01 14:49:26.153	\N	WAREHOUSE	\N	\N
cmjvk9llf001nv0x8fgf4s4x5	cmjqno0820026my1sja4mh5sf	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0820026my1sja4mh5sf:v1	\N	\N	2026-01-01 14:49:26.163	\N	WAREHOUSE	\N	\N
cmjvk9llo001qv0x8lydgzc3o	cmjqno08i002cmy1sgfs513js	initial_load	27	0	27	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno08i002cmy1sgfs513js:v1	\N	\N	2026-01-01 14:49:26.173	\N	WAREHOUSE	\N	\N
cmjvk9llz001tv0x8gb81ljro	cmjqno08p002fmy1sn2qzzkcc	initial_load	4	0	4	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno08p002fmy1sn2qzzkcc:v1	\N	\N	2026-01-01 14:49:26.183	\N	WAREHOUSE	\N	\N
cmjvk9lm9001wv0x8aej1hh05	cmjqno08x002imy1s1or9o4uv	initial_load	6	0	6	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno08x002imy1s1or9o4uv:v1	\N	\N	2026-01-01 14:49:26.193	\N	WAREHOUSE	\N	\N
cmjvk9lmi001zv0x8mwkgsx1l	cmjqno094002lmy1sles9c8k6	initial_load	4	0	4	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno094002lmy1sles9c8k6:v1	\N	\N	2026-01-01 14:49:26.203	\N	WAREHOUSE	\N	\N
cmjvk9lms0022v0x8dw6hcm4d	cmjqno09d002omy1sq0fjefql	initial_load	60	0	60	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno09d002omy1sq0fjefql:v1	\N	\N	2026-01-01 14:49:26.213	\N	WAREHOUSE	\N	\N
cmjvk9ln10025v0x8cvpbl69d	cmjqno09m002rmy1sytcvzck9	initial_load	72	0	72	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno09m002rmy1sytcvzck9:v1	\N	\N	2026-01-01 14:49:26.222	\N	WAREHOUSE	\N	\N
cmjvk9lnb0028v0x8lgnlkp0u	cmjqno09w002umy1s00enpdc7	initial_load	5	0	5	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno09w002umy1s00enpdc7:v1	\N	\N	2026-01-01 14:49:26.231	\N	WAREHOUSE	\N	\N
cmjvk9lnm002bv0x8qfp617iv	cmjqno0a5002xmy1sw2hlsnke	initial_load	9	0	9	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0a5002xmy1sw2hlsnke:v1	\N	\N	2026-01-01 14:49:26.242	\N	WAREHOUSE	\N	\N
cmjvk9lnw002ev0x8yekkrczh	cmjqno0ao0033my1scpwf168s	initial_load	3744	0	3744	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0ao0033my1scpwf168s:v1	\N	\N	2026-01-01 14:49:26.252	\N	WAREHOUSE	\N	\N
cmjvk9lo5002hv0x8qr5nv92t	cmjqno0av0036my1sdzetzen5	initial_load	4	0	4	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0av0036my1sdzetzen5:v1	\N	\N	2026-01-01 14:49:26.262	\N	WAREHOUSE	\N	\N
cmjvk9lof002kv0x8wdrdw1ty	cmjqno0bb003cmy1s5vlnwb2b	initial_load	50	0	50	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0bb003cmy1s5vlnwb2b:v1	\N	\N	2026-01-01 14:49:26.272	\N	WAREHOUSE	\N	\N
cmjvk9lop002nv0x8d6da8n4f	cmjqno0bi003fmy1smhbzdcic	initial_load	5	0	5	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0bi003fmy1smhbzdcic:v1	\N	\N	2026-01-01 14:49:26.281	\N	WAREHOUSE	\N	\N
cmjvk9lox002qv0x8g757dlme	cmjqno0br003imy1sewdy2nmy	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0br003imy1sewdy2nmy:v1	\N	\N	2026-01-01 14:49:26.29	\N	WAREHOUSE	\N	\N
cmjvk9lp6002tv0x8bn7iceig	cmjqno0by003lmy1sdo6l0uij	initial_load	3	0	3	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0by003lmy1sdo6l0uij:v1	\N	\N	2026-01-01 14:49:26.299	\N	WAREHOUSE	\N	\N
cmjvk9lpf002wv0x846neec44	cmjqno0c6003omy1s30ilmfqx	initial_load	15	0	15	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0c6003omy1s30ilmfqx:v1	\N	\N	2026-01-01 14:49:26.307	\N	WAREHOUSE	\N	\N
cmjvk9lpp002zv0x8sl92trpx	cmjqno0cd003rmy1skt761jdm	initial_load	2	0	2	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0cd003rmy1skt761jdm:v1	\N	\N	2026-01-01 14:49:26.317	\N	WAREHOUSE	\N	\N
cmjvk9lpy0032v0x8yxemf68u	cmjqno0ct003xmy1s46smdyjj	initial_load	13	0	13	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0ct003xmy1s46smdyjj:v1	\N	\N	2026-01-01 14:49:26.326	\N	WAREHOUSE	\N	\N
cmjvk9lq80035v0x8xrdmnj6z	cmjqno0d20040my1s4g0k07an	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0d20040my1s4g0k07an:v1	\N	\N	2026-01-01 14:49:26.336	\N	WAREHOUSE	\N	\N
cmjvk9lqh0038v0x8h5e3einy	cmjqno0d90043my1sgrf6ig0d	initial_load	32	0	32	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0d90043my1sgrf6ig0d:v1	\N	\N	2026-01-01 14:49:26.345	\N	WAREHOUSE	\N	\N
cmjvk9lqq003bv0x8e1okus9r	cmjqno0di0046my1svbuvyzws	initial_load	3	0	3	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0di0046my1svbuvyzws:v1	\N	\N	2026-01-01 14:49:26.355	\N	WAREHOUSE	\N	\N
cmjvk9lr0003ev0x87g2c06ps	cmjqno0dr0049my1sq04c53cj	initial_load	7	0	7	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0dr0049my1sq04c53cj:v1	\N	\N	2026-01-01 14:49:26.365	\N	WAREHOUSE	\N	\N
cmjvk9lrc003hv0x83y8l7q0x	cmjqno0e8004fmy1s0gnyi973	initial_load	2	0	2	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0e8004fmy1s0gnyi973:v1	\N	\N	2026-01-01 14:49:26.376	\N	WAREHOUSE	\N	\N
cmjvk9lrm003kv0x8urnd2854	cmjqno0em004lmy1slmr9pgii	initial_load	4	0	4	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0em004lmy1slmr9pgii:v1	\N	\N	2026-01-01 14:49:26.387	\N	WAREHOUSE	\N	\N
cmjvk9lrw003nv0x8v0a7rb4g	cmjqno0f1004rmy1s5wbbunlh	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0f1004rmy1s5wbbunlh:v1	\N	\N	2026-01-01 14:49:26.396	\N	WAREHOUSE	\N	\N
cmjvk9ls4003qv0x80hw9zoqq	cmjqno0fh004xmy1smriqpt1u	initial_load	12	0	12	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0fh004xmy1smriqpt1u:v1	\N	\N	2026-01-01 14:49:26.405	\N	WAREHOUSE	\N	\N
cmjvk9lse003tv0x8ewxrvd9z	cmjqno0fp0050my1s5y7d3hu3	initial_load	84	0	84	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0fp0050my1s5y7d3hu3:v1	\N	\N	2026-01-01 14:49:26.415	\N	WAREHOUSE	\N	\N
cmjvk9lsn003wv0x8nv0p6x6b	cmjqno0g50056my1su9itk4oy	initial_load	76	0	76	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0g50056my1su9itk4oy:v1	\N	\N	2026-01-01 14:49:26.424	\N	WAREHOUSE	\N	\N
cmjvk9lsx003zv0x8esam73da	cmjqno0gb0059my1selmdlw9f	initial_load	71	0	71	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0gb0059my1selmdlw9f:v1	\N	\N	2026-01-01 14:49:26.433	\N	WAREHOUSE	\N	\N
cmjvk9lt60042v0x8zbcc8xfz	cmjqno0gj005cmy1s73agplxo	initial_load	438	0	438	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0gj005cmy1s73agplxo:v1	\N	\N	2026-01-01 14:49:26.442	\N	WAREHOUSE	\N	\N
cmjvk9ltg0045v0x8qmgtapfh	cmjqno0gr005fmy1sd74rsayv	initial_load	17	0	17	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0gr005fmy1sd74rsayv:v1	\N	\N	2026-01-01 14:49:26.452	\N	WAREHOUSE	\N	\N
cmjvk9ltp0048v0x83wzluwg2	cmjqno0gz005imy1scpgoy62p	initial_load	4	0	4	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0gz005imy1scpgoy62p:v1	\N	\N	2026-01-01 14:49:26.462	\N	WAREHOUSE	\N	\N
cmjvk9ltz004bv0x8o4jxbe60	cmjqno0i7005umy1si0086cg7	initial_load	12	0	12	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0i7005umy1si0086cg7:v1	\N	\N	2026-01-01 14:49:26.472	\N	WAREHOUSE	\N	\N
cmjvk9lu9004ev0x8sj6j4t0j	cmjqno0ij005xmy1s7c00z7ji	initial_load	4	0	4	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0ij005xmy1s7c00z7ji:v1	\N	\N	2026-01-01 14:49:26.481	\N	WAREHOUSE	\N	\N
cmjvk9luh004hv0x8lvly4lw1	cmjqno0is0060my1skgsod4h2	initial_load	9	0	9	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0is0060my1skgsod4h2:v1	\N	\N	2026-01-01 14:49:26.49	\N	WAREHOUSE	\N	\N
cmjvk9lut004kv0x89gt9tcfh	cmjqno0j10063my1szgnd805t	initial_load	2	0	2	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0j10063my1szgnd805t:v1	\N	\N	2026-01-01 14:49:26.501	\N	WAREHOUSE	\N	\N
cmjvk9lv2004nv0x8estf75dc	cmjqno0jh0069my1sempl6rib	initial_load	5	0	5	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0jh0069my1sempl6rib:v1	\N	\N	2026-01-01 14:49:26.511	\N	WAREHOUSE	\N	\N
cmjvk9lvc004qv0x8y9o4hsqc	cmjqno0jo006cmy1so4kx7b3s	initial_load	7	0	7	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0jo006cmy1so4kx7b3s:v1	\N	\N	2026-01-01 14:49:26.521	\N	WAREHOUSE	\N	\N
cmjvk9lvl004tv0x89n5mrbu2	cmjqno0jw006fmy1sclgmauk3	initial_load	6	0	6	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0jw006fmy1sclgmauk3:v1	\N	\N	2026-01-01 14:49:26.53	\N	WAREHOUSE	\N	\N
cmjvk9lvv004wv0x8ck7x3ymm	cmjqno0k4006imy1s6o3yfzu9	initial_load	90	0	90	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0k4006imy1s6o3yfzu9:v1	\N	\N	2026-01-01 14:49:26.539	\N	WAREHOUSE	\N	\N
cmjvk9lw3004zv0x8003zmxxc	cmjqno0kl006omy1sj6jkutct	initial_load	8	0	8	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0kl006omy1sj6jkutct:v1	\N	\N	2026-01-01 14:49:26.548	\N	WAREHOUSE	\N	\N
cmjvk9lwc0052v0x8asznw6w5	cmjqno0l2006umy1sp70ne45r	initial_load	128	0	128	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0l2006umy1sp70ne45r:v1	\N	\N	2026-01-01 14:49:26.557	\N	WAREHOUSE	\N	\N
cmjvk9lwm0055v0x8jpyibtru	cmjqno0lc006xmy1suz1u2ve2	initial_load	512	0	512	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0lc006xmy1suz1u2ve2:v1	\N	\N	2026-01-01 14:49:26.567	\N	WAREHOUSE	\N	\N
cmjvk9lwv0058v0x852rk3v1x	cmjqno0ll0070my1snl8s6v8n	initial_load	92	0	92	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0ll0070my1snl8s6v8n:v1	\N	\N	2026-01-01 14:49:26.575	\N	WAREHOUSE	\N	\N
cmjvk9lx5005bv0x812v087m1	cmjqno0lu0073my1sddkfv8er	initial_load	2	0	2	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0lu0073my1sddkfv8er:v1	\N	\N	2026-01-01 14:49:26.586	\N	WAREHOUSE	\N	\N
cmjvk9lxe005ev0x8t5fff2p8	cmjqno0ma0079my1sfrw1wbda	initial_load	88	0	88	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0ma0079my1sfrw1wbda:v1	\N	\N	2026-01-01 14:49:26.594	\N	WAREHOUSE	\N	\N
cmjvk9lxp005hv0x8wxh1b47o	cmjqno0mk007cmy1syudhfgey	initial_load	50	0	50	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0mk007cmy1syudhfgey:v1	\N	\N	2026-01-01 14:49:26.605	\N	WAREHOUSE	\N	\N
cmjvk9ly0005kv0x8lo8ra07t	cmjqno0mt007fmy1sct2eaqw2	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0mt007fmy1sct2eaqw2:v1	\N	\N	2026-01-01 14:49:26.617	\N	WAREHOUSE	\N	\N
cmjvk9lya005nv0x8hs8wfqfy	cmjqno0n3007imy1s7xoebaru	initial_load	4	0	4	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0n3007imy1s7xoebaru:v1	\N	\N	2026-01-01 14:49:26.626	\N	WAREHOUSE	\N	\N
cmjvk9lyj005qv0x874ihiubs	cmjqno0nd007lmy1sommwbphf	initial_load	1057	0	1057	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0nd007lmy1sommwbphf:v1	\N	\N	2026-01-01 14:49:26.635	\N	WAREHOUSE	\N	\N
cmjvk9lyt005tv0x8i6t41c8k	cmjqno0nn007omy1sivxf04xk	initial_load	6	0	6	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0nn007omy1sivxf04xk:v1	\N	\N	2026-01-01 14:49:26.645	\N	WAREHOUSE	\N	\N
cmjvk9lz2005wv0x8870lg52f	cmjqno0nw007rmy1s8ar2ddx8	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0nw007rmy1s8ar2ddx8:v1	\N	\N	2026-01-01 14:49:26.654	\N	WAREHOUSE	\N	\N
cmjvk9lzb005zv0x8sscoj3sv	cmjqno0o6007umy1s4uscg5f2	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0o6007umy1s4uscg5f2:v1	\N	\N	2026-01-01 14:49:26.663	\N	WAREHOUSE	\N	\N
cmjvk9lzk0062v0x8fpow0ivj	cmjqno0og007xmy1sv6bfshg5	initial_load	6	0	6	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0og007xmy1sv6bfshg5:v1	\N	\N	2026-01-01 14:49:26.672	\N	WAREHOUSE	\N	\N
cmjvk9lzs0065v0x8ntywj7c0	cmjqno0oy0083my1sh5sc3472	initial_load	3	0	3	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0oy0083my1sh5sc3472:v1	\N	\N	2026-01-01 14:49:26.681	\N	WAREHOUSE	\N	\N
cmjvk9m010068v0x89dd45l6x	cmjqno0p60086my1so5ozbrnt	initial_load	26	0	26	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0p60086my1so5ozbrnt:v1	\N	\N	2026-01-01 14:49:26.689	\N	WAREHOUSE	\N	\N
cmjvk9m0c006bv0x87lq3xk5p	cmjqno0pf0089my1snnk797ip	initial_load	11	0	11	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0pf0089my1snnk797ip:v1	\N	\N	2026-01-01 14:49:26.7	\N	WAREHOUSE	\N	\N
cmjvk9m0k006ev0x8tiy9mr3i	cmjqno0qe008lmy1sw3xkbogz	initial_load	2	0	2	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0qe008lmy1sw3xkbogz:v1	\N	\N	2026-01-01 14:49:26.708	\N	WAREHOUSE	\N	\N
cmjvk9m0t006hv0x8i78glg5r	cmjqno0qo008omy1shg16tl9x	initial_load	2	0	2	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0qo008omy1shg16tl9x:v1	\N	\N	2026-01-01 14:49:26.717	\N	WAREHOUSE	\N	\N
cmjvk9m12006kv0x86pyqc6os	cmjqno0r1008rmy1sjqfzphz0	initial_load	143	0	143	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0r1008rmy1sjqfzphz0:v1	\N	\N	2026-01-01 14:49:26.727	\N	WAREHOUSE	\N	\N
cmjvk9m1b006nv0x8o8apyh93	cmjqno0rd008umy1snu2dwolv	initial_load	4	0	4	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0rd008umy1snu2dwolv:v1	\N	\N	2026-01-01 14:49:26.735	\N	WAREHOUSE	\N	\N
cmjvk9m1o006qv0x80ncs71b6	cmjqno0s20093my1s1oje6uem	initial_load	2	0	2	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0s20093my1s1oje6uem:v1	\N	\N	2026-01-01 14:49:26.748	\N	WAREHOUSE	\N	\N
cmjvk9m1x006tv0x8bcaxdexo	cmjqno0sm0099my1s1ka0cdob	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0sm0099my1s1ka0cdob:v1	\N	\N	2026-01-01 14:49:26.758	\N	WAREHOUSE	\N	\N
cmjvk9m26006wv0x8gt9p9f5m	cmjqno0sv009cmy1srkhog05k	initial_load	3	0	3	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0sv009cmy1srkhog05k:v1	\N	\N	2026-01-01 14:49:26.767	\N	WAREHOUSE	\N	\N
cmjvk9m2g006zv0x84vc51qub	cmjqno0t5009fmy1sf6e88t53	initial_load	10	0	10	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0t5009fmy1sf6e88t53:v1	\N	\N	2026-01-01 14:49:26.777	\N	WAREHOUSE	\N	\N
cmjvk9m2q0072v0x8zxe3buao	cmjqno0te009imy1soh67goun	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0te009imy1soh67goun:v1	\N	\N	2026-01-01 14:49:26.786	\N	WAREHOUSE	\N	\N
cmjvk9m2z0075v0x82byxjpuk	cmjqno0tp009lmy1souhdrd5p	initial_load	8	0	8	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0tp009lmy1souhdrd5p:v1	\N	\N	2026-01-01 14:49:26.796	\N	WAREHOUSE	\N	\N
cmjvk9m380078v0x859t3xcwz	cmjqno0u1009omy1sbndrfd68	initial_load	20	0	20	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0u1009omy1sbndrfd68:v1	\N	\N	2026-01-01 14:49:26.805	\N	WAREHOUSE	\N	\N
cmjvk9m3h007bv0x8s1gfgnow	cmjqno0v8009xmy1sudlemhvd	initial_load	2	0	2	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0v8009xmy1sudlemhvd:v1	\N	\N	2026-01-01 14:49:26.814	\N	WAREHOUSE	\N	\N
cmjvk9m3r007ev0x8xeds3e6h	cmjqno0vl00a0my1s27wjda95	initial_load	45	0	45	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0vl00a0my1s27wjda95:v1	\N	\N	2026-01-01 14:49:26.824	\N	WAREHOUSE	\N	\N
cmjvk9m41007hv0x84e2qwsi3	cmjqno0vw00a3my1s2emzbm8i	initial_load	3	0	3	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0vw00a3my1s2emzbm8i:v1	\N	\N	2026-01-01 14:49:26.834	\N	WAREHOUSE	\N	\N
cmjvk9m4c007kv0x8zn73aaa6	cmjqno0w700a6my1sth1rs7tf	initial_load	9	0	9	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0w700a6my1sth1rs7tf:v1	\N	\N	2026-01-01 14:49:26.844	\N	WAREHOUSE	\N	\N
cmjvk9m4m007nv0x81nihe1t3	cmjqno0wh00a9my1szcwdds1t	initial_load	5	0	5	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0wh00a9my1szcwdds1t:v1	\N	\N	2026-01-01 14:49:26.854	\N	WAREHOUSE	\N	\N
cmjvk9m4y007qv0x8iz3wwsau	cmjqno0wr00acmy1s1jw9cdmu	initial_load	3	0	3	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0wr00acmy1s1jw9cdmu:v1	\N	\N	2026-01-01 14:49:26.866	\N	WAREHOUSE	\N	\N
cmjvk9m57007tv0x8cjsb0ai5	cmjqno0x100afmy1sonxakg5h	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0x100afmy1sonxakg5h:v1	\N	\N	2026-01-01 14:49:26.875	\N	WAREHOUSE	\N	\N
cmjvk9m5f007wv0x8nyn3n6kg	cmjqno0xa00aimy1stqgf2jii	initial_load	5	0	5	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0xa00aimy1stqgf2jii:v1	\N	\N	2026-01-01 14:49:26.884	\N	WAREHOUSE	\N	\N
cmjvk9m5o007zv0x8qr24g6if	cmjqno0xk00almy1sp55aujm8	initial_load	435	0	435	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0xk00almy1sp55aujm8:v1	\N	\N	2026-01-01 14:49:26.892	\N	WAREHOUSE	\N	\N
cmjvk9m5w0082v0x8k24fp2ue	cmjqno0y600army1sbh7m6ovr	initial_load	17	0	17	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0y600army1sbh7m6ovr:v1	\N	\N	2026-01-01 14:49:26.901	\N	WAREHOUSE	\N	\N
cmjvk9m650085v0x8k1c3cpdp	cmjqno0yh00aumy1s1a6yjbyh	initial_load	3	0	3	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0yh00aumy1s1a6yjbyh:v1	\N	\N	2026-01-01 14:49:26.909	\N	WAREHOUSE	\N	\N
cmjvk9m6e0088v0x8x2ylbokn	cmjqno0ys00axmy1ssln3ovlx	initial_load	6	0	6	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0ys00axmy1ssln3ovlx:v1	\N	\N	2026-01-01 14:49:26.918	\N	WAREHOUSE	\N	\N
cmjvk9m6m008bv0x80pn42kw6	cmjqno0z200b0my1sncqj50i2	initial_load	6	0	6	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0z200b0my1sncqj50i2:v1	\N	\N	2026-01-01 14:49:26.927	\N	WAREHOUSE	\N	\N
cmjvk9m6v008ev0x8s557oiq3	cmjqno0zc00b3my1srzljm87d	initial_load	4	0	4	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0zc00b3my1srzljm87d:v1	\N	\N	2026-01-01 14:49:26.935	\N	WAREHOUSE	\N	\N
cmjvk9m73008hv0x8fz6u55vf	cmjqno0zm00b6my1s96d0wu71	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno0zm00b6my1s96d0wu71:v1	\N	\N	2026-01-01 14:49:26.943	\N	WAREHOUSE	\N	\N
cmjvk9m7b008kv0x8wahhav5r	cmjqno10c00bcmy1sh38bn45k	initial_load	3	0	3	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno10c00bcmy1sh38bn45k:v1	\N	\N	2026-01-01 14:49:26.952	\N	WAREHOUSE	\N	\N
cmjvk9m7j008nv0x8pkl3t7vp	cmjqno10q00bfmy1sqekllt8x	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno10q00bfmy1sqekllt8x:v1	\N	\N	2026-01-01 14:49:26.96	\N	WAREHOUSE	\N	\N
cmjvk9m7t008qv0x8z7be0me5	cmjqno11g00blmy1s6ec9f42t	initial_load	7	0	7	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno11g00blmy1s6ec9f42t:v1	\N	\N	2026-01-01 14:49:26.969	\N	WAREHOUSE	\N	\N
cmjvk9m82008tv0x8l1uny7qq	cmjqno11r00bomy1s19u54qds	initial_load	8	0	8	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno11r00bomy1s19u54qds:v1	\N	\N	2026-01-01 14:49:26.978	\N	WAREHOUSE	\N	\N
cmjvk9m8b008wv0x8u0kxtqd3	cmjqno12400brmy1sx4sgzddj	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno12400brmy1sx4sgzddj:v1	\N	\N	2026-01-01 14:49:26.988	\N	WAREHOUSE	\N	\N
cmjvk9m8j008zv0x89waaam5d	cmjqno12j00bumy1sgwyurrgi	initial_load	80	0	80	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno12j00bumy1sgwyurrgi:v1	\N	\N	2026-01-01 14:49:26.996	\N	WAREHOUSE	\N	\N
cmjvk9m8s0092v0x8cjpnj9vc	cmjqno13b00c3my1s5ert0nt9	initial_load	2	0	2	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno13b00c3my1s5ert0nt9:v1	\N	\N	2026-01-01 14:49:27.004	\N	WAREHOUSE	\N	\N
cmjvk9m900095v0x81dh3nsz7	cmjqno13n00c6my1so8d0z9yf	initial_load	3	0	3	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno13n00c6my1so8d0z9yf:v1	\N	\N	2026-01-01 14:49:27.013	\N	WAREHOUSE	\N	\N
cmjvk9m980098v0x8snzgiihx	cmjqno13v00c9my1squ8yho5w	initial_load	170	0	170	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno13v00c9my1squ8yho5w:v1	\N	\N	2026-01-01 14:49:27.021	\N	WAREHOUSE	\N	\N
cmjvk9m9h009bv0x8q88j72fc	cmjqno14900ccmy1su0x83h4x	initial_load	5	0	5	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno14900ccmy1su0x83h4x:v1	\N	\N	2026-01-01 14:49:27.029	\N	WAREHOUSE	\N	\N
cmjvk9m9q009ev0x8s1bv60rl	cmjqno14k00cfmy1syhhalf4v	initial_load	3	0	3	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno14k00cfmy1syhhalf4v:v1	\N	\N	2026-01-01 14:49:27.038	\N	WAREHOUSE	\N	\N
cmjvk9ma0009hv0x8mb9og1jf	cmjqno14u00cimy1s0t8teld0	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno14u00cimy1s0t8teld0:v1	\N	\N	2026-01-01 14:49:27.048	\N	WAREHOUSE	\N	\N
cmjvk9ma9009kv0x8b41n8bu4	cmjqno15d00comy1s14i2k5hw	initial_load	14	0	14	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno15d00comy1s14i2k5hw:v1	\N	\N	2026-01-01 14:49:27.058	\N	WAREHOUSE	\N	\N
cmjvk9man009nv0x83wjahaoe	cmjqno16900cxmy1sy2ouy747	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno16900cxmy1sy2ouy747:v1	\N	\N	2026-01-01 14:49:27.071	\N	WAREHOUSE	\N	\N
cmjvk9mb0009qv0x8hcdulcmw	cmjqno16t00d3my1s3ewn4962	initial_load	4	0	4	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno16t00d3my1s3ewn4962:v1	\N	\N	2026-01-01 14:49:27.084	\N	WAREHOUSE	\N	\N
cmjvk9mbb009tv0x8vrgawk63	cmjqno17200d6my1sgc8ncg32	initial_load	6	0	6	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno17200d6my1sgc8ncg32:v1	\N	\N	2026-01-01 14:49:27.095	\N	WAREHOUSE	\N	\N
cmjvk9mbm009wv0x8mkp92cu8	cmjqno17e00d9my1sfjhb5s81	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno17e00d9my1sfjhb5s81:v1	\N	\N	2026-01-01 14:49:27.106	\N	WAREHOUSE	\N	\N
cmjvk9mbw009zv0x85hld8rl4	cmjqno17w00dfmy1syh7ullcf	initial_load	4	0	4	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno17w00dfmy1syh7ullcf:v1	\N	\N	2026-01-01 14:49:27.117	\N	WAREHOUSE	\N	\N
cmjvk9mc600a2v0x8fm6ht289	cmjqno18500dimy1scfaje3wm	initial_load	7	0	7	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno18500dimy1scfaje3wm:v1	\N	\N	2026-01-01 14:49:27.127	\N	WAREHOUSE	\N	\N
cmjvk9mci00a5v0x8f80wrn80	cmjqno18j00dlmy1s5zqejdux	initial_load	5	0	5	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno18j00dlmy1s5zqejdux:v1	\N	\N	2026-01-01 14:49:27.138	\N	WAREHOUSE	\N	\N
cmjvk9mct00a8v0x8u1feya9w	cmjqno18t00domy1sa4tj7ci9	initial_load	25	0	25	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno18t00domy1sa4tj7ci9:v1	\N	\N	2026-01-01 14:49:27.149	\N	WAREHOUSE	\N	\N
cmjvk9md400abv0x8cogo01m1	cmjqno19500drmy1s036dacsx	initial_load	3	0	3	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno19500drmy1s036dacsx:v1	\N	\N	2026-01-01 14:49:27.16	\N	WAREHOUSE	\N	\N
cmjvk9mdf00aev0x83nugdktt	cmjqno1a000e0my1sr7dx4st1	initial_load	67	0	67	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno1a000e0my1sr7dx4st1:v1	\N	\N	2026-01-01 14:49:27.171	\N	WAREHOUSE	\N	\N
cmjvk9mdq00ahv0x8u7b0hut8	cmjqno1aa00e3my1s8kw7r7wv	initial_load	77	0	77	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno1aa00e3my1s8kw7r7wv:v1	\N	\N	2026-01-01 14:49:27.182	\N	WAREHOUSE	\N	\N
cmjvk9me100akv0x8gdm8h90d	cmjqno1al00e6my1ssw77rzcz	initial_load	70	0	70	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno1al00e6my1ssw77rzcz:v1	\N	\N	2026-01-01 14:49:27.193	\N	WAREHOUSE	\N	\N
cmjvk9mef00anv0x8w6f6t4er	cmjqno1ax00e9my1s6dopbdg0	initial_load	30	0	30	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno1ax00e9my1s6dopbdg0:v1	\N	\N	2026-01-01 14:49:27.207	\N	WAREHOUSE	\N	\N
cmjvk9met00aqv0x8dw567kzb	cmjqno1b800ecmy1she42kf0u	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno1b800ecmy1she42kf0u:v1	\N	\N	2026-01-01 14:49:27.221	\N	WAREHOUSE	\N	\N
cmjvk9mf500atv0x8ycm4ya7v	cmjqno1ce00elmy1s7ayiz0yw	initial_load	21	0	21	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno1ce00elmy1s7ayiz0yw:v1	\N	\N	2026-01-01 14:49:27.234	\N	WAREHOUSE	\N	\N
cmjvk9mfl00awv0x83jdwk4zz	cmjqno1cn00eomy1shevfrmyd	initial_load	6	0	6	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno1cn00eomy1shevfrmyd:v1	\N	\N	2026-01-01 14:49:27.25	\N	WAREHOUSE	\N	\N
cmjvk9mfz00azv0x8df5dqkfx	cmjqno1cy00ermy1s9pfpqctx	initial_load	72	0	72	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno1cy00ermy1s9pfpqctx:v1	\N	\N	2026-01-01 14:49:27.263	\N	WAREHOUSE	\N	\N
cmjvk9mgb00b2v0x8n8u4lfji	cmjqno1di00exmy1s3vue6xga	initial_load	256	0	256	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno1di00exmy1s3vue6xga:v1	\N	\N	2026-01-01 14:49:27.275	\N	WAREHOUSE	\N	\N
cmjvk9mgl00b5v0x8rlcm03mo	cmjqno1dr00f0my1sjl6j3a9v	initial_load	16	0	16	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno1dr00f0my1sjl6j3a9v:v1	\N	\N	2026-01-01 14:49:27.286	\N	WAREHOUSE	\N	\N
cmjvk9mgw00b8v0x8kr2jgc3q	cmjqno1e300f3my1s6pkjbbn2	initial_load	3	0	3	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno1e300f3my1s6pkjbbn2:v1	\N	\N	2026-01-01 14:49:27.296	\N	WAREHOUSE	\N	\N
cmjvk9mh700bbv0x8e6lwar5b	cmjqno1ee00f6my1scfrgo4d2	initial_load	19	0	19	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno1ee00f6my1scfrgo4d2:v1	\N	\N	2026-01-01 14:49:27.307	\N	WAREHOUSE	\N	\N
cmjvk9mhi00bev0x86orn6vdu	cmjqno1ep00f9my1s9e5cj5ry	initial_load	1	0	1	\N	\N	\N	Opening physical count (imported from spreadsheet)	initload:cmjqno1ep00f9my1s9e5cj5ry:v1	\N	\N	2026-01-01 14:49:27.319	\N	WAREHOUSE	\N	\N
cmjvy1l620002ytwvgwthh31m	cmjqno1d900eumy1sr37sqnar	audit_count	1	0	1	\N	MANAGER	\N	Smoke test	audit-smoke-001	\N	\N	2026-01-01 21:15:06.987	\N	WAREHOUSE	\N	\N
cmjvy5asj0005ytwvj3dsm078	cmjqno1d900eumy1sr37sqnar	audit_count	0	1	1	\N	MANAGER	\N	Smoke test	audit-smoke-002	\N	\N	2026-01-01 21:18:00.163	\N	WAREHOUSE	\N	\N
cmjvy6d2f0008ytwv4z7yl0h3	cmjqno1d900eumy1sr37sqnar	audit_count	12	1	13	\N	MANAGER	\N	Smoke test	audit-smoke-003	\N	\N	2026-01-01 21:18:49.767	\N	WAREHOUSE	\N	\N
cmjvy72lz000bytwvwb5zxdlc	cmjqno1d900eumy1sr37sqnar	audit_count	-13	13	0	\N	MANAGER	\N	Smoke test	audit-smoke-004	\N	\N	2026-01-01 21:19:22.871	\N	WAREHOUSE	\N	\N
cmjwexus30006umaclv7cbyk2	cmjqno1dr00f0my1sjl6j3a9v	transfer	-1	16	15	\N	MANAGER	\N	A1 test loadout	XFER-A1-TEST-001:OUT	\N	\N	2026-01-02 05:08:06.291	\N	WAREHOUSE	b4546e0c-74c6-4ebe-963f-084a48bbb32b	XFER-A1-TEST-001
cmjwexus60008umac47axirfa	cmjqno1dr00f0my1sjl6j3a9v	transfer	1	0	1	\N	MANAGER	\N	A1 test loadout	XFER-A1-TEST-001:IN	\N	\N	2026-01-02 05:08:06.294	\N	TRUCK:cmjwe4b7e0001p4nzqq3ithwo	b4546e0c-74c6-4ebe-963f-084a48bbb32b	XFER-A1-TEST-001
cmk1yj0ie000brq89kze70ji3	cmjqno0030000my1sprl3ajh9	transfer	-1	1	0	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmk1yicvr0001rq89habkt975:cmk1yicvr0003rq89etqgpbek:OUT	\N	\N	2026-01-06 02:15:17.078	\N	WAREHOUSE	cmk1yicvr0001rq89habkt975	cmk1yicvr0001rq89habkt975
cmk1yj0ig000drq89cn51gvqe	cmjqno0030000my1sprl3ajh9	transfer	1	0	1	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmk1yicvr0001rq89habkt975:cmk1yicvr0003rq89etqgpbek:IN	\N	\N	2026-01-06 02:15:17.081	\N	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	cmk1yicvr0001rq89habkt975	cmk1yicvr0001rq89habkt975
cmk1yj0in000jrq89f8k6hd9j	cmjqno0180003my1slmqx61lk	transfer	-1	11	10	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmk1yicvr0001rq89habkt975:cmk1yicvr0004rq892x79zdk3:OUT	\N	\N	2026-01-06 02:15:17.088	\N	WAREHOUSE	cmk1yicvr0001rq89habkt975	cmk1yicvr0001rq89habkt975
cmk1yj0io000lrq8959q89q6q	cmjqno0180003my1slmqx61lk	transfer	1	0	1	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmk1yicvr0001rq89habkt975:cmk1yicvr0004rq892x79zdk3:IN	\N	\N	2026-01-06 02:15:17.089	\N	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	cmk1yicvr0001rq89habkt975	cmk1yicvr0001rq89habkt975
cmkfcmsmr000brf7zp5nojwhb	cmjqno0030000my1sprl3ajh9	transfer	-1	0	-1	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkfclucs0001rf7z169ekie0:cmkfclucs0003rf7z6xs6l5pi:OUT	\N	\N	2026-01-15 11:11:08.403	\N	WAREHOUSE	cmkfclucs0001rf7z169ekie0	cmkfclucs0001rf7z169ekie0
cmkfcmsmw000drf7zaax7g960	cmjqno0030000my1sprl3ajh9	transfer	1	1	2	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkfclucs0001rf7z169ekie0:cmkfclucs0003rf7z6xs6l5pi:IN	\N	\N	2026-01-15 11:11:08.409	\N	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	cmkfclucs0001rf7z169ekie0	cmkfclucs0001rf7z169ekie0
cmkfcmsn6000jrf7zdn25k8so	cmjqno15d00comy1s14i2k5hw	transfer	-1	14	13	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkfclucs0001rf7z169ekie0:cmkfclucs0004rf7zarpq181y:OUT	\N	\N	2026-01-15 11:11:08.418	\N	WAREHOUSE	cmkfclucs0001rf7z169ekie0	cmkfclucs0001rf7z169ekie0
cmkfcmsn6000lrf7zywhoqo0o	cmjqno15d00comy1s14i2k5hw	transfer	1	0	1	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkfclucs0001rf7z169ekie0:cmkfclucs0004rf7zarpq181y:IN	\N	\N	2026-01-15 11:11:08.419	\N	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	cmkfclucs0001rf7z169ekie0	cmkfclucs0001rf7z169ekie0
cmkfytetc000bxhkceuaxc3r5	cmjqno17w00dfmy1syh7ullcf	transfer	-1	4	3	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkfqz5o50001xhkcvt0qc545:cmkfqz5o50003xhkcjlpm9dps:OUT	\N	\N	2026-01-15 21:32:08.641	\N	WAREHOUSE	cmkfqz5o50001xhkcvt0qc545	cmkfqz5o50001xhkcvt0qc545
cmkfytetf000dxhkcq43c83eo	cmjqno17w00dfmy1syh7ullcf	transfer	1	0	1	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkfqz5o50001xhkcvt0qc545:cmkfqz5o50003xhkcjlpm9dps:IN	\N	\N	2026-01-15 21:32:08.643	\N	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	cmkfqz5o50001xhkcvt0qc545	cmkfqz5o50001xhkcvt0qc545
cmkfytett000jxhkc3vaj9u5a	cmjqno0a5002xmy1sw2hlsnke	transfer	-1	9	8	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkfqz5o50001xhkcvt0qc545:cmkfqz5o50004xhkc387q6gf5:OUT	\N	\N	2026-01-15 21:32:08.657	\N	WAREHOUSE	cmkfqz5o50001xhkcvt0qc545	cmkfqz5o50001xhkcvt0qc545
cmkfytetv000lxhkcyzt2e5yd	cmjqno0a5002xmy1sw2hlsnke	transfer	1	0	1	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkfqz5o50001xhkcvt0qc545:cmkfqz5o50004xhkc387q6gf5:IN	\N	\N	2026-01-15 21:32:08.659	\N	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	cmkfqz5o50001xhkcvt0qc545	cmkfqz5o50001xhkcvt0qc545
cmkg6gubp000a12cnb0hmiigl	cmjqno05s001fmy1smzuq969d	transfer	-1	5	4	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkg3uufc0001bi3zpc2f5jd3:cmkg3uufc0003bi3zy8dxlay3:OUT	\N	\N	2026-01-16 01:06:19.142	\N	WAREHOUSE	cmkg3uufc0001bi3zpc2f5jd3	cmkg3uufc0001bi3zpc2f5jd3
cmkg6gubv000c12cn2glgn0dj	cmjqno05s001fmy1smzuq969d	transfer	1	0	1	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkg3uufc0001bi3zpc2f5jd3:cmkg3uufc0003bi3zy8dxlay3:IN	\N	\N	2026-01-16 01:06:19.147	\N	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	cmkg3uufc0001bi3zpc2f5jd3	cmkg3uufc0001bi3zpc2f5jd3
cmkg6guc2000i12cn7yk4etld	cmjqno0530016my1sj6kd05or	transfer	-1	1	0	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkg3uufc0001bi3zpc2f5jd3:cmkg3uufc0004bi3zwef8orbc:OUT	\N	\N	2026-01-16 01:06:19.154	\N	WAREHOUSE	cmkg3uufc0001bi3zpc2f5jd3	cmkg3uufc0001bi3zpc2f5jd3
cmkg6guc3000k12cn8evip5x4	cmjqno0530016my1sj6kd05or	transfer	1	0	1	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkg3uufc0001bi3zpc2f5jd3:cmkg3uufc0004bi3zwef8orbc:IN	\N	\N	2026-01-16 01:06:19.155	\N	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	cmkg3uufc0001bi3zpc2f5jd3	cmkg3uufc0001bi3zpc2f5jd3
cmkg6guc8000q12cntqnstpmf	cmjqno1ce00elmy1s7ayiz0yw	transfer	-1	21	20	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkg3uufc0001bi3zpc2f5jd3:cmkg3uufc0005bi3z826fw9ij:OUT	\N	\N	2026-01-16 01:06:19.161	\N	WAREHOUSE	cmkg3uufc0001bi3zpc2f5jd3	cmkg3uufc0001bi3zpc2f5jd3
cmkg6guc9000s12cn4kwz9ie5	cmjqno1ce00elmy1s7ayiz0yw	transfer	1	0	1	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkg3uufc0001bi3zpc2f5jd3:cmkg3uufc0005bi3z826fw9ij:IN	\N	\N	2026-01-16 01:06:19.162	\N	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	cmkg3uufc0001bi3zpc2f5jd3	cmkg3uufc0001bi3zpc2f5jd3
cmkg6gxv9000z12cnveon2a8p	cmjqno0180003my1slmqx61lk	transfer	-1	10	9	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkg6gmoz000112cne2pnj8f4:cmkg6gmoz000312cnvhe73udl:OUT	\N	\N	2026-01-16 01:06:23.733	\N	WAREHOUSE	cmkg6gmoz000112cne2pnj8f4	cmkg6gmoz000112cne2pnj8f4
cmkg6gxvd001112cnf5dzr0q7	cmjqno0180003my1slmqx61lk	transfer	1	1	2	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkg6gmoz000112cne2pnj8f4:cmkg6gmoz000312cnvhe73udl:IN	\N	\N	2026-01-16 01:06:23.738	\N	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	cmkg6gmoz000112cne2pnj8f4	cmkg6gmoz000112cne2pnj8f4
cmkg6olk9001g12cnzgft8o5s	cmjqno0530016my1sj6kd05or	transfer	-1	0	-1	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkg6matl001712cn95k0vtvb:cmkg6matl001912cn3cxuemvd:OUT	\N	\N	2026-01-16 01:12:21.034	\N	WAREHOUSE	cmkg6matl001712cn95k0vtvb	cmkg6matl001712cn95k0vtvb
cmkg6olkc001i12cnaxcrhnwo	cmjqno0530016my1sj6kd05or	transfer	1	1	2	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkg6matl001712cn95k0vtvb:cmkg6matl001912cn3cxuemvd:IN	\N	\N	2026-01-16 01:12:21.036	\N	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	cmkg6matl001712cn95k0vtvb	cmkg6matl001712cn95k0vtvb
cmkg6xtwh0006lwnbiumqlsm3	cmjqno05s001fmy1smzuq969d	transfer	-1	4	3	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkg6m6y6001312cnpgq7s4gy:cmkg6m6y6001512cn6870xbl9:OUT	\N	\N	2026-01-16 01:19:31.746	\N	WAREHOUSE	cmkg6m6y6001312cnpgq7s4gy	cmkg6m6y6001312cnpgq7s4gy
cmkg6xtwk0008lwnbaxq9q11k	cmjqno05s001fmy1smzuq969d	transfer	1	1	2	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	ADMIN	\N		cmkg6m6y6001312cnpgq7s4gy:cmkg6m6y6001512cn6870xbl9:IN	\N	\N	2026-01-16 01:19:31.749	\N	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	cmkg6m6y6001312cnpgq7s4gy	cmkg6m6y6001312cnpgq7s4gy
\.


--
-- Data for Name: Notification; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Notification" (id, "userId", message, type, "readAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: Product; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Product" (id, name, "epaRegNo", description, category, "baseType", "trackingUnitLabel", "checkoutUnitLabel", "orderingUnitLabel", "trackingToBase", "checkoutToBase", "orderingToBase", "reorderLevelBase", "quantityInReorder", "leadTimeDays", "createdAt", "updatedAt", "isDiscontinued", "isStocked", behavior) FROM stdin;
cmjqno0030000my1sprl3ajh9	ADVANCE GRANULAR CARPENTER ANT BAIT	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:45.987	2025-12-29 04:25:45.987	f	t	CONSUMABLE
cmjqno0180003my1slmqx61lk	ADVION ANT GEL	\N	\N	CHEMICAL	COUNT	each	each	case (4)	1	1	4	\N	\N	\N	2025-12-29 04:25:46.028	2025-12-29 04:25:46.028	f	t	CONSUMABLE
cmjqno01m0006my1se4whmz7o	ADVION INSECT GRANULE	\N	\N	CHEMICAL	MASS	lbs	oz	1 lb bag	16	1	16	\N	\N	\N	2025-12-29 04:25:46.042	2025-12-29 04:25:46.042	f	f	CONSUMABLE
cmjqno01y0009my1sstw6e11w	ADVION MICROFLOW	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.055	2025-12-29 04:25:46.055	f	f	CONSUMABLE
cmjqno02c000cmy1sxsortew6	ADVION TRIO COCKROACH GEL	\N	\N	CHEMICAL	COUNT	each	each	case (4)	1	1	4	\N	\N	\N	2025-12-29 04:25:46.068	2025-12-29 04:25:46.068	f	f	CONSUMABLE
cmjqno02o000fmy1szxk4dsd4	ADVION WDG	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.08	2025-12-29 04:25:46.08	f	f	CONSUMABLE
cmjqno030000imy1syend3obx	AIRCOVER NONIONIC ORGANIC	\N	\N	CHEMICAL	VOLUME	gal	fl oz	1 gal jug	128	1	128	\N	\N	\N	2025-12-29 04:25:46.093	2025-12-29 04:25:46.093	f	t	CONSUMABLE
cmjqno03c000lmy1ss210wlo6	AIRWORKS AIR FRESHENER NEUTRALIZER	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.104	2025-12-29 04:25:46.104	f	t	CONSUMABLE
cmjqno03n000omy1sfomzqeq7	ALPINE WSG (200g)	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.116	2025-12-29 04:25:46.116	f	t	CONSUMABLE
cmjqno03y000rmy1skec7bs6p	ALPINE WSG (500g)	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.126	2025-12-29 04:25:46.126	f	t	CONSUMABLE
cmjqno046000umy1s8v95c9sw	ALTOSID PRO-G IGR	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.135	2025-12-29 04:25:46.135	f	t	CONSUMABLE
cmjqno04e000xmy1s4l72kcq6	ANTIXX GRANULES	\N	\N	CHEMICAL	MASS	lbs	oz	20 lb bag	16	1	320	\N	\N	\N	2025-12-29 04:25:46.142	2025-12-29 04:25:46.142	f	f	CONSUMABLE
cmjqno04n0010my1scsfh2nch	ANTIXX LIQUID	\N	\N	CHEMICAL	MASS	oz	oz	32 oz bottle	1	1	32	\N	\N	\N	2025-12-29 04:25:46.151	2025-12-29 04:25:46.151	f	f	CONSUMABLE
cmjqno04v0013my1spw3wcttr	AQUABAC MOSQUITO GRANULE	\N	\N	CHEMICAL	MASS	lbs	oz	40 lb bag	16	1	640	\N	\N	\N	2025-12-29 04:25:46.159	2025-12-29 04:25:46.159	f	f	CONSUMABLE
cmjqno0530016my1sj6kd05or	AVERT DF	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.167	2025-12-29 04:25:46.167	f	t	CONSUMABLE
cmjqno05b0019my1sv2rk9tvp	AVESTA CS	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.175	2025-12-29 04:25:46.175	f	f	CONSUMABLE
cmjqno05j001cmy1s4pv84e47	BEDLAM	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.184	2025-12-29 04:25:46.184	f	f	CONSUMABLE
cmjqno05s001fmy1smzuq969d	BEDLAM PLUS	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.192	2025-12-29 04:25:46.192	f	t	CONSUMABLE
cmjqno060001imy1snk2z9gvn	BIFEN I/T	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.201	2025-12-29 04:25:46.201	f	f	CONSUMABLE
cmjqno06a001lmy1srgs7s1yw	BORACTIN	\N	\N	CHEMICAL	MASS	lbs	oz	25 lb bag	16	1	400	\N	\N	\N	2025-12-29 04:25:46.21	2025-12-29 04:25:46.21	f	t	CONSUMABLE
cmjqno06n001omy1s7bby80hv	BORACTIN - 5LB PAIL	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.223	2025-12-29 04:25:46.223	f	t	CONSUMABLE
cmjqno06w001rmy1smz0mx0kh	CATCHMASTER GIANT GLUE BOARDS	\N	\N	CHEMICAL	COUNT	each	each	case (24)	1	1	24	\N	\N	\N	2025-12-29 04:25:46.233	2025-12-29 04:25:46.233	f	t	CONSUMABLE
cmjqno076001umy1soz0adsum	CATCHMASTER MOUSE GLUE BOARDS	\N	\N	CHEMICAL	COUNT	each	each	case (72)	1	1	72	\N	\N	\N	2025-12-29 04:25:46.242	2025-12-29 04:25:46.242	f	t	CONSUMABLE
cmjqno07g001xmy1s9woks2tb	CB-80	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.252	2025-12-29 04:25:46.252	f	t	CONSUMABLE
cmjqno07n0020my1s3zlg5f9v	CIMEXA INSECTICIDE DUST	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.26	2025-12-29 04:25:46.26	f	t	CONSUMABLE
cmjqno07v0023my1s0wfqtql2	CONTRAC BLOX	\N	\N	CHEMICAL	MASS	lbs	oz	18 lb pail	16	1	288	\N	\N	\N	2025-12-29 04:25:46.267	2025-12-29 04:25:46.267	f	t	CONSUMABLE
cmjqno0820026my1sja4mh5sf	CONTRAC BLOX - 4 LB PAIL	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.275	2025-12-29 04:25:46.275	f	t	CONSUMABLE
cmjqno08a0029my1sycc8uylf	CONTRAPEST FEEDING TRAY - 13.5 OZ	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.282	2025-12-29 04:25:46.282	f	t	CONSUMABLE
cmjqno08i002cmy1sgfs513js	CONTRAPEST HANGER - 8 OZ	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.29	2025-12-29 04:25:46.29	f	t	CONSUMABLE
cmjqno08p002fmy1sn2qzzkcc	CONTRAPEST HANGER UNIT	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.298	2025-12-29 04:25:46.298	f	t	CONSUMABLE
cmjqno08x002imy1s1or9o4uv	CROSSFIRE AEROSOL	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.305	2025-12-29 04:25:46.305	f	f	CONSUMABLE
cmjqno094002lmy1sles9c8k6	CROSSFIRE BED BUG CONCENTRATE	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.313	2025-12-29 04:25:46.313	f	f	CONSUMABLE
cmjqno09d002omy1sq0fjefql	CYCICK CS	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.322	2025-12-29 04:25:46.322	f	f	CONSUMABLE
cmjqno09m002rmy1sytcvzck9	CYZMIC CS	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.33	2025-12-29 04:25:46.33	f	f	CONSUMABLE
cmjqno09w002umy1s00enpdc7	DELTA DUST	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.34	2025-12-29 04:25:46.34	f	t	CONSUMABLE
cmjqno0a5002xmy1sw2hlsnke	DEMAND CS	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.35	2025-12-29 04:25:46.35	f	t	CONSUMABLE
cmjqno0af0030my1se085poy5	D-FENSE NXT	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.36	2025-12-29 04:25:46.36	f	f	CONSUMABLE
cmjqno0ao0033my1scpwf168s	DITRAC BAIT BLOX	\N	\N	CHEMICAL	MASS	lbs	oz	18 lb pail	16	1	288	\N	\N	\N	2025-12-29 04:25:46.368	2025-12-29 04:25:46.368	f	t	CONSUMABLE
cmjqno0av0036my1sdzetzen5	DITRAC BAIT BLOX - 4 LB PAIL	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.376	2025-12-29 04:25:46.376	f	t	CONSUMABLE
cmjqno0b40039my1sri6lwesx	DOXEM NXT	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.384	2025-12-29 04:25:46.384	f	f	CONSUMABLE
cmjqno0bb003cmy1s5vlnwb2b	DR. T'S MOSQUITO REPELLING GRANULES	\N	\N	CHEMICAL	MASS	lbs	oz	25 lb bag	16	1	400	\N	\N	\N	2025-12-29 04:25:46.391	2025-12-29 04:25:46.391	f	f	CONSUMABLE
cmjqno0bi003fmy1smhbzdcic	DROPLEX XTRA ADJUVANT	\N	\N	CHEMICAL	VOLUME	gal	fl oz	2.5 gal jug	128	1	320	\N	\N	\N	2025-12-29 04:25:46.398	2025-12-29 04:25:46.398	f	t	CONSUMABLE
cmjqno0br003imy1sewdy2nmy	DSV	\N	\N	CHEMICAL	VOLUME	gal	fl oz	1 gal jug	128	1	128	\N	\N	\N	2025-12-29 04:25:46.407	2025-12-29 04:25:46.407	f	t	CONSUMABLE
cmjqno0by003lmy1sdo6l0uij	DUPONT ALTRISET TERMITICIDE	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.415	2025-12-29 04:25:46.415	f	f	CONSUMABLE
cmjqno0c6003omy1s30ilmfqx	DUST MASK M95	\N	\N	CHEMICAL	COUNT	each	each	case (20)	1	1	20	\N	\N	\N	2025-12-29 04:25:46.422	2025-12-29 04:25:46.422	f	t	CONSUMABLE
cmjqno0cd003rmy1skt761jdm	ECO EXTEND	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.43	2025-12-29 04:25:46.43	f	f	CONSUMABLE
cmjqno0cl003umy1s89ty8khl	ECO PCO ACU	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.438	2025-12-29 04:25:46.438	f	f	CONSUMABLE
cmjqno0ct003xmy1s46smdyjj	ECO PCO ARX	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.446	2025-12-29 04:25:46.446	f	t	CONSUMABLE
cmjqno0d20040my1s4g0k07an	ECO PCO DX	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.454	2025-12-29 04:25:46.454	f	f	CONSUMABLE
cmjqno0d90043my1sgrf6ig0d	ECO PCO WP-X	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.462	2025-12-29 04:25:46.462	f	f	CONSUMABLE
cmjqno0di0046my1svbuvyzws	ECO VIA WD	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.47	2025-12-29 04:25:46.47	f	t	CONSUMABLE
cmjqno0dr0049my1sq04c53cj	ENDIUS COCKROACH GEL BAIT	\N	\N	CHEMICAL	COUNT	each	each	case (4)	1	1	4	\N	\N	\N	2025-12-29 04:25:46.479	2025-12-29 04:25:46.479	f	f	CONSUMABLE
cmjqno0e0004cmy1s5zw1joe5	ESSENTRIA ALL- PURPOSE	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.488	2025-12-29 04:25:46.488	f	f	CONSUMABLE
cmjqno0e8004fmy1s0gnyi973	ESSENTRIA BROADCAST	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.496	2025-12-29 04:25:46.496	f	f	CONSUMABLE
cmjqno0ef004imy1s8rcqidds	ESSENTRIA DUST	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.504	2025-12-29 04:25:46.504	f	f	CONSUMABLE
cmjqno0em004lmy1slmr9pgii	ESSENTRIA G	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.511	2025-12-29 04:25:46.511	f	t	CONSUMABLE
cmjqno0et004omy1slvvcid2y	ESSENTRIA GENERAL HOUSEHOLD	\N	\N	CHEMICAL	MASS	oz	oz	1 oz bottle	1	1	1	\N	\N	\N	2025-12-29 04:25:46.518	2025-12-29 04:25:46.518	f	f	CONSUMABLE
cmjqno0f1004rmy1s5wbbunlh	ESSENTRIA MOSQUITO & TICK	\N	\N	CHEMICAL	VOLUME	gal	fl oz	1 gal jug	128	1	128	\N	\N	\N	2025-12-29 04:25:46.526	2025-12-29 04:25:46.526	f	f	CONSUMABLE
cmjqno0f9004umy1sijbikrzj	ESSENTRIA WASP & HORNET SPRAY	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.533	2025-12-29 04:25:46.533	f	f	CONSUMABLE
cmjqno0fh004xmy1smriqpt1u	EVO PROTECTA EDGE	\N	\N	CHEMICAL	COUNT	each	each	case (6)	1	1	6	\N	\N	\N	2025-12-29 04:25:46.542	2025-12-29 04:25:46.542	f	f	CONSUMABLE
cmjqno0fp0050my1s5y7d3hu3	EVO PROTECTA EXPRESS	\N	\N	CHEMICAL	COUNT	each	each	pallet (96)	1	1	96	\N	\N	\N	2025-12-29 04:25:46.55	2025-12-29 04:25:46.55	f	t	CONSUMABLE
cmjqno0fx0053my1sj2uwwull	EXCITE R 55	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.557	2025-12-29 04:25:46.557	f	t	CONSUMABLE
cmjqno0g50056my1su9itk4oy	EXODUS VCS CONCENTRATE	\N	\N	CHEMICAL	MASS	oz	oz	32 oz bottle	1	1	32	\N	\N	\N	2025-12-29 04:25:46.565	2025-12-29 04:25:46.565	f	t	CONSUMABLE
cmjqno0gb0059my1selmdlw9f	EXODUS VCS DUST	\N	\N	CHEMICAL	MASS	lbs	oz	30 lb bag	16	1	480	\N	\N	\N	2025-12-29 04:25:46.572	2025-12-29 04:25:46.572	f	t	CONSUMABLE
cmjqno0gj005cmy1s73agplxo	EXODUS VCS GRANULE	\N	\N	CHEMICAL	MASS	lbs	oz	30 lb bag	16	1	480	\N	\N	\N	2025-12-29 04:25:46.58	2025-12-29 04:25:46.58	f	t	CONSUMABLE
cmjqno0gr005fmy1sd74rsayv	FENDONA CS	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.588	2025-12-29 04:25:46.588	f	f	CONSUMABLE
cmjqno0gz005imy1scpgoy62p	FICAM D	\N	\N	CHEMICAL	MASS	lbs	oz	1 lb bag	16	1	16	\N	\N	\N	2025-12-29 04:25:46.596	2025-12-29 04:25:46.596	f	f	CONSUMABLE
cmjqno0h8005lmy1s8y9ngsw8	FINAL ALL WEATHER BLOX	\N	\N	CHEMICAL	MASS	oz	oz	1 oz bottle	1	1	1	\N	\N	\N	2025-12-29 04:25:46.604	2025-12-29 04:25:46.604	f	f	CONSUMABLE
cmjqno0hg005omy1stlep63uy	FINAL FEED MOSQUITO BAIT	\N	\N	CHEMICAL	MASS	oz	oz	4 oz bottle	1	1	4	\N	\N	\N	2025-12-29 04:25:46.613	2025-12-29 04:25:46.613	f	f	CONSUMABLE
cmjqno0ht005rmy1sr3bvxkzh	FINAL SOFT BAIT	\N	\N	CHEMICAL	MASS	oz	oz	1 oz bottle	1	1	1	\N	\N	\N	2025-12-29 04:25:46.625	2025-12-29 04:25:46.625	f	f	CONSUMABLE
cmjqno0i7005umy1si0086cg7	FIREBACK BED BUG & INSECT	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.639	2025-12-29 04:25:46.639	f	t	CONSUMABLE
cmjqno0ij005xmy1s7c00z7ji	FOAM FRESH BIO-SANITATION	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.651	2025-12-29 04:25:46.651	f	t	CONSUMABLE
cmjqno0is0060my1skgsod4h2	FORMITROL ANT BAIT	\N	\N	CHEMICAL	COUNT	each	each	case (4)	1	1	4	\N	\N	\N	2025-12-29 04:25:46.661	2025-12-29 04:25:46.661	f	f	CONSUMABLE
cmjqno0j10063my1szgnd805t	FUSE TERMITICIDE/INSECTICIDE	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.67	2025-12-29 04:25:46.67	f	f	CONSUMABLE
cmjqno0j90066my1sksdpw8ii	GENTROL AEROSOL	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.677	2025-12-29 04:25:46.677	f	f	CONSUMABLE
cmjqno0jh0069my1sempl6rib	GENTROL COMPLETE	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.685	2025-12-29 04:25:46.685	f	t	CONSUMABLE
cmjqno0jo006cmy1so4kx7b3s	GENTROL IGR CONCENTRATE - 1 OZ	\N	\N	CHEMICAL	COUNT	each	each	case (10)	1	1	10	\N	\N	\N	2025-12-29 04:25:46.693	2025-12-29 04:25:46.693	f	f	CONSUMABLE
cmjqno0jw006fmy1sclgmauk3	GENTROL IGR CONCENTRATE - 16 OZ	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.701	2025-12-29 04:25:46.701	f	t	CONSUMABLE
cmjqno0k4006imy1s6o3yfzu9	GENTROL POINT SOURCE ROACH BAIT	\N	\N	CHEMICAL	COUNT	each	each	case (20)	1	1	20	\N	\N	\N	2025-12-29 04:25:46.709	2025-12-29 04:25:46.709	f	t	CONSUMABLE
cmjqno0kc006lmy1sa2jxxxmh	GLO STICK FLYING INSECT TRAP	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.717	2025-12-29 04:25:46.717	f	f	CONSUMABLE
cmjqno0kl006omy1sj6jkutct	GREEN GLOVES (SIZE 10)	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.726	2025-12-29 04:25:46.726	f	t	CONSUMABLE
cmjqno0ku006rmy1s7z4lqske	GREEN GLOVES (SIZE 11)	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.735	2025-12-29 04:25:46.735	f	t	CONSUMABLE
cmjqno0l2006umy1sp70ne45r	GREENSHIELD IA CONCENTRATE	\N	\N	CHEMICAL	VOLUME	gal	fl oz	1 gal jug	128	1	128	\N	\N	\N	2025-12-29 04:25:46.743	2025-12-29 04:25:46.743	t	f	CONSUMABLE
cmjqno0lc006xmy1suz1u2ve2	GREENSHIELD PRO RBW CONCENTRATE	\N	\N	CHEMICAL	VOLUME	gal	fl oz	1 gal jug	128	1	128	\N	\N	\N	2025-12-29 04:25:46.752	2025-12-29 04:25:46.752	t	f	CONSUMABLE
cmjqno0ll0070my1snl8s6v8n	GREENSHIELD RBW DUST	\N	\N	CHEMICAL	MASS	lbs	oz	30 lb bag	16	1	480	\N	\N	\N	2025-12-29 04:25:46.762	2025-12-29 04:25:46.762	t	f	CONSUMABLE
cmjqno0lu0073my1sddkfv8er	GREENSHIELD RBWIA GRANULES	\N	\N	CHEMICAL	MASS	lbs	oz	30 lb bag	16	1	480	\N	\N	\N	2025-12-29 04:25:46.77	2025-12-29 04:25:46.77	t	f	CONSUMABLE
cmjqno0m20076my1s5j4uq4oo	GREENSHIELD RBWIA POUCHES	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.779	2025-12-29 04:25:46.779	t	f	CONSUMABLE
cmjqno0ma0079my1sfrw1wbda	IN2CARE MIX	\N	\N	CHEMICAL	COUNT	each	each	case (25)	1	1	25	\N	\N	\N	2025-12-29 04:25:46.787	2025-12-29 04:25:46.787	f	t	CONSUMABLE
cmjqno0mk007cmy1syudhfgey	IN2CARE STATION	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.797	2025-12-29 04:25:46.797	f	t	CONSUMABLE
cmjqno0mt007fmy1sct2eaqw2	INSECTIGUARD YARDGUARD	\N	\N	CHEMICAL	VOLUME	gal	fl oz	1 gal jug	128	1	128	\N	\N	\N	2025-12-29 04:25:46.805	2025-12-29 04:25:46.805	f	f	CONSUMABLE
cmjqno0n3007imy1s7xoebaru	INTICE 10 (1 LB)	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.815	2025-12-29 04:25:46.815	f	t	CONSUMABLE
cmjqno0nd007lmy1sommwbphf	INTICE 10 (40 LBS)	\N	\N	CHEMICAL	MASS	lbs	oz	40 lb bag	16	1	640	\N	\N	\N	2025-12-29 04:25:46.826	2025-12-29 04:25:46.826	f	t	CONSUMABLE
cmjqno0nn007omy1sivxf04xk	INVADE HOT SPOT	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.835	2025-12-29 04:25:46.835	f	t	CONSUMABLE
cmjqno0nw007rmy1s8ar2ddx8	KILLS BED BUGS PLUS	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.845	2025-12-29 04:25:46.845	f	f	CONSUMABLE
cmjqno0o6007umy1s4uscg5f2	KNESS KETCH-ALL LIVE MULTI TRAP (LG)	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.854	2025-12-29 04:25:46.854	f	f	CONSUMABLE
cmjqno0og007xmy1sv6bfshg5	KNESS PRO-KETCH LIVE MOUSE TRAP (SM)	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.864	2025-12-29 04:25:46.864	f	f	CONSUMABLE
cmjqno0op0080my1sztbhbcpd	MAXFORCE COMPLETE GRANULAR	\N	\N	CHEMICAL	MASS	oz	oz	1 oz bottle	1	1	1	\N	\N	\N	2025-12-29 04:25:46.873	2025-12-29 04:25:46.873	f	f	CONSUMABLE
cmjqno0oy0083my1sh5sc3472	MAXFORCE FC ANT BAIT STATIONS	\N	\N	CHEMICAL	COUNT	each	each	case (4)	1	1	4	\N	\N	\N	2025-12-29 04:25:46.882	2025-12-29 04:25:46.882	f	t	CONSUMABLE
cmjqno0p60086my1so5ozbrnt	MAXFORCE FC ROACH BAIT STATIONS	\N	\N	CHEMICAL	COUNT	each	each	bag (72)	1	1	72	\N	\N	\N	2025-12-29 04:25:46.891	2025-12-29 04:25:46.891	f	t	CONSUMABLE
cmjqno0pf0089my1snnk797ip	MAXFORCE FC ROACH GEL BAIT	\N	\N	CHEMICAL	COUNT	each	each	case (4)	1	1	4	\N	\N	\N	2025-12-29 04:25:46.9	2025-12-29 04:25:46.9	f	t	CONSUMABLE
cmjqno0po008cmy1sstpu8t5o	MAXFORCE FC SELECT ROACH KILLER BAIT GEL	\N	\N	CHEMICAL	COUNT	each	each	case (4)	1	1	4	\N	\N	\N	2025-12-29 04:25:46.908	2025-12-29 04:25:46.908	f	f	CONSUMABLE
cmjqno0pw008fmy1scglwighf	MAXFORCE GRANULAR FLY BAIT	\N	\N	CHEMICAL	MASS	lbs	oz	10 lb bag	16	1	160	\N	\N	\N	2025-12-29 04:25:46.917	2025-12-29 04:25:46.917	f	f	CONSUMABLE
cmjqno0q6008imy1sjq8chc9p	MAXFORCE IMPACT ROACH GEL BAIT	\N	\N	CHEMICAL	COUNT	each	each	case (4)	1	1	4	\N	\N	\N	2025-12-29 04:25:46.926	2025-12-29 04:25:46.926	f	f	CONSUMABLE
cmjqno0qe008lmy1sw3xkbogz	MOSQUITO MIST ULTRA	\N	\N	CHEMICAL	VOLUME	gal	fl oz	gal	128	1	128	\N	\N	\N	2025-12-29 04:25:46.934	2025-12-29 04:25:46.934	f	t	CONSUMABLE
cmjqno0qo008omy1shg16tl9x	MYSTIC SPI BLUE	\N	\N	CHEMICAL	VOLUME	gal	fl oz	1 gal jug	128	1	128	\N	\N	\N	2025-12-29 04:25:46.944	2025-12-29 04:25:46.944	f	f	CONSUMABLE
cmjqno0r1008rmy1sjqfzphz0	NIBOR-D INSECTICIDE	\N	\N	CHEMICAL	MASS	lbs	oz	15 lb pail	16	1	240	\N	\N	\N	2025-12-29 04:25:46.957	2025-12-29 04:25:46.957	f	t	CONSUMABLE
cmjqno0rd008umy1snu2dwolv	NIBOR-D INSECTICIDE FOAM + IGR	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.969	2025-12-29 04:25:46.969	f	t	CONSUMABLE
cmjqno0rk008xmy1sj346xj2v	NILOTRON - Mtn Rain Aerosol- Freshner	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.977	2025-12-29 04:25:46.977	f	f	CONSUMABLE
cmjqno0rt0090my1sk1umz595	NITRILE GLOVES (LG)	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.985	2025-12-29 04:25:46.985	f	t	CONSUMABLE
cmjqno0s20093my1s1oje6uem	NITRILE GLOVES (MD)	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:46.994	2025-12-29 04:25:46.994	f	t	CONSUMABLE
cmjqno0sc0096my1s2feu8e2s	NITRILE GLOVES (XL)	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.005	2025-12-29 04:25:47.005	f	t	CONSUMABLE
cmjqno0sm0099my1s1ka0cdob	NITRILE GLOVES (XXL)	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.015	2025-12-29 04:25:47.015	f	t	CONSUMABLE
cmjqno0sv009cmy1srkhog05k	NYGUARD IGR CONCENTRATE	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.024	2025-12-29 04:25:47.024	f	t	CONSUMABLE
cmjqno0t5009fmy1sf6e88t53	ODOR CONTROL FOGGER	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.033	2025-12-29 04:25:47.033	f	t	CONSUMABLE
cmjqno0te009imy1soh67goun	ONE GUARD MULTI MOA CONC	\N	\N	CHEMICAL	VOLUME	gal	fl oz	1 gal jug	128	1	128	\N	\N	\N	2025-12-29 04:25:47.042	2025-12-29 04:25:47.042	f	f	CONSUMABLE
cmjqno0tp009lmy1souhdrd5p	ONSLAUGHT FC	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.054	2025-12-29 04:25:47.054	f	t	CONSUMABLE
cmjqno0u1009omy1sbndrfd68	OPTIGARD ANT GEL	\N	\N	CHEMICAL	COUNT	each	each	case (4)	1	1	4	\N	\N	\N	2025-12-29 04:25:47.065	2025-12-29 04:25:47.065	f	t	CONSUMABLE
cmjqno0uf009rmy1s5ajkdu4l	OPTIGARD FLEX	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.079	2025-12-29 04:25:47.079	f	f	CONSUMABLE
cmjqno0us009umy1s1qowgha7	PERMADUST	\N	\N	CHEMICAL	MASS	lbs	oz	1 lb bag	16	1	16	\N	\N	\N	2025-12-29 04:25:47.093	2025-12-29 04:25:47.093	f	f	CONSUMABLE
cmjqno0v8009xmy1sudlemhvd	PETCOR FLEA & TICK SPRAY	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.108	2025-12-29 04:25:47.108	f	t	CONSUMABLE
cmjqno0vl00a0my1s27wjda95	PHANTOM TERMITICIDE/ INSECTICIDE	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.121	2025-12-29 04:25:47.121	f	f	CONSUMABLE
cmjqno0vw00a3my1s2emzbm8i	POST FLIGHT	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.132	2025-12-29 04:25:47.132	f	t	CONSUMABLE
cmjqno0w700a6my1sth1rs7tf	PRECOR 2625 PREMISE	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.143	2025-12-29 04:25:47.143	f	t	CONSUMABLE
cmjqno0wh00a9my1szcwdds1t	PRECOR IGR CONCENTRATE	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.154	2025-12-29 04:25:47.154	f	t	CONSUMABLE
cmjqno0wr00acmy1s1jw9cdmu	PRECOR OUTDOOR FTM	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.163	2025-12-29 04:25:47.163	f	f	CONSUMABLE
cmjqno0x100afmy1sonxakg5h	PREMISE GRANULES	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.173	2025-12-29 04:25:47.173	f	f	CONSUMABLE
cmjqno0xa00aimy1stqgf2jii	PREMISE PRE-CONSTRUCTION	\N	\N	CHEMICAL	VOLUME	gal	fl oz	275 oz bottle	128	1	275	\N	\N	\N	2025-12-29 04:25:47.183	2025-12-29 04:25:47.183	f	f	CONSUMABLE
cmjqno0xk00almy1sp55aujm8	PROBAIT - 25 LBS	\N	\N	CHEMICAL	MASS	lbs	oz	25 lb bag	16	1	400	\N	\N	\N	2025-12-29 04:25:47.193	2025-12-29 04:25:47.193	f	t	CONSUMABLE
cmjqno0xu00aomy1st71mojb8	PROBAIT - 4.5 LBS	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.203	2025-12-29 04:25:47.203	t	f	CONSUMABLE
cmjqno0y600army1sbh7m6ovr	PROFOAM PLATINUM NPD	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.214	2025-12-29 04:25:47.214	f	t	CONSUMABLE
cmjqno0yh00aumy1s1a6yjbyh	PROTECTA RTU	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.225	2025-12-29 04:25:47.225	f	f	CONSUMABLE
cmjqno0ys00axmy1ssln3ovlx	PT 221L PRESSURIZED	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.237	2025-12-29 04:25:47.237	f	f	CONSUMABLE
cmjqno0z200b0my1sncqj50i2	PT ALPINE FLEA & BED BUG	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.247	2025-12-29 04:25:47.247	f	f	CONSUMABLE
cmjqno0zc00b3my1srzljm87d	PT CLEAR ZONE III	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.256	2025-12-29 04:25:47.256	f	t	CONSUMABLE
cmjqno0zm00b6my1s96d0wu71	PT ULTRACIDE	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.267	2025-12-29 04:25:47.267	f	f	CONSUMABLE
cmjqno0zz00b9my1s24jq7ly8	PT WASP FREEZE	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.279	2025-12-29 04:25:47.279	f	f	CONSUMABLE
cmjqno10c00bcmy1sh38bn45k	QUALIPRO FIPRONIL GRANULES	\N	\N	CHEMICAL	COUNT	each	each	30 lb bag	1	1	1	\N	\N	\N	2025-12-29 04:25:47.292	2025-12-29 04:25:47.292	f	f	CONSUMABLE
cmjqno10q00bfmy1sqekllt8x	RATSORB	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.307	2025-12-29 04:25:47.307	f	t	CONSUMABLE
cmjqno11200bimy1sszkfdp69	RIDESCO WG	\N	\N	CHEMICAL	MASS	oz	oz	1 oz bottle	1	1	1	\N	\N	\N	2025-12-29 04:25:47.318	2025-12-29 04:25:47.318	f	f	CONSUMABLE
cmjqno11g00blmy1s6ec9f42t	ROUND UP QUICK PRO	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.333	2025-12-29 04:25:47.333	f	f	CONSUMABLE
cmjqno11r00bomy1s19u54qds	SCION INSECTICIDE	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.343	2025-12-29 04:25:47.343	f	f	CONSUMABLE
cmjqno12400brmy1sx4sgzddj	SECTOR MISTING CONCENTRATE	\N	\N	CHEMICAL	VOLUME	gal	fl oz	1 gal jug	128	1	128	\N	\N	\N	2025-12-29 04:25:47.356	2025-12-29 04:25:47.356	f	f	CONSUMABLE
cmjqno12j00bumy1sgwyurrgi	SELONTRA RODENT BAIT	\N	\N	CHEMICAL	MASS	lbs	oz	8 lb bag	16	1	128	\N	\N	\N	2025-12-29 04:25:47.372	2025-12-29 04:25:47.372	f	f	CONSUMABLE
cmjqno12t00bxmy1sbnhcfmao	SHATTER TERMITE BAIT	\N	\N	CHEMICAL	MASS	oz	oz	1 oz bottle	1	1	1	\N	\N	\N	2025-12-29 04:25:47.381	2025-12-29 04:25:47.381	f	f	CONSUMABLE
cmjqno13300c0my1sxlumsydl	SHOCKWAVE FOGGING CONCENTRATE	\N	\N	CHEMICAL	MASS	oz	oz	1 oz bottle	1	1	1	\N	\N	\N	2025-12-29 04:25:47.391	2025-12-29 04:25:47.391	f	f	CONSUMABLE
cmjqno13b00c3my1s5ert0nt9	SNAKE A WAY	\N	\N	CHEMICAL	MASS	lbs	oz	4 lb bag	16	1	64	\N	\N	\N	2025-12-29 04:25:47.4	2025-12-29 04:25:47.4	f	f	CONSUMABLE
cmjqno13n00c6my1so8d0z9yf	SNAP TRAP (LG)	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.412	2025-12-29 04:25:47.412	f	f	CONSUMABLE
cmjqno13v00c9my1squ8yho5w	STERIFAB	\N	\N	CHEMICAL	MASS	oz	oz	128 oz bottle	1	1	128	\N	\N	\N	2025-12-29 04:25:47.42	2025-12-29 04:25:47.42	f	f	CONSUMABLE
cmjqno14900ccmy1su0x83h4x	STRYKER HORNET KILLER	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.433	2025-12-29 04:25:47.433	f	f	CONSUMABLE
cmjqno14k00cfmy1syhhalf4v	SUSPEND POLYZONE	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.445	2025-12-29 04:25:47.445	f	f	CONSUMABLE
cmjqno14u00cimy1s0t8teld0	SUSPEND SC INSECTICIDE	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.454	2025-12-29 04:25:47.454	f	t	CONSUMABLE
cmjqno15400clmy1sm393t9tk	TALPIRID MOLE	\N	\N	CHEMICAL	MASS	oz	oz	1 oz bottle	1	1	1	\N	\N	\N	2025-12-29 04:25:47.465	2025-12-29 04:25:47.465	f	f	CONSUMABLE
cmjqno15d00comy1s14i2k5hw	TALSTAR PRO	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.473	2025-12-29 04:25:47.473	f	t	CONSUMABLE
cmjqno15o00crmy1svr7o30bd	TALSTAR XTRA GRANULES	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.484	2025-12-29 04:25:47.484	f	f	CONSUMABLE
cmjqno16000cumy1smpuccxkp	TANDEM	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.497	2025-12-29 04:25:47.497	f	f	CONSUMABLE
cmjqno16900cxmy1sy2ouy747	TAURUS SC	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.506	2025-12-29 04:25:47.506	f	f	CONSUMABLE
cmjqno16j00d0my1swpw76q2n	TEKKO PRO	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.515	2025-12-29 04:25:47.515	f	f	CONSUMABLE
cmjqno16t00d3my1s3ewn4962	TEMPO DUST	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.526	2025-12-29 04:25:47.526	f	f	CONSUMABLE
cmjqno17200d6my1sgc8ncg32	TEMPRID DUST	\N	\N	CHEMICAL	MASS	oz	oz	4 oz bottle	1	1	4	\N	\N	\N	2025-12-29 04:25:47.534	2025-12-29 04:25:47.534	f	f	CONSUMABLE
cmjqno17e00d9my1sfjhb5s81	TEMPRID FX	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.546	2025-12-29 04:25:47.546	f	f	CONSUMABLE
cmjqno17o00dcmy1s1d25skl1	TEMPRID SC	\N	\N	CHEMICAL	COUNT	each	each	case (4)	1	1	4	\N	\N	\N	2025-12-29 04:25:47.557	2025-12-29 04:25:47.557	f	t	CONSUMABLE
cmjqno17w00dfmy1syh7ullcf	TERMIDOR HE	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.565	2025-12-29 04:25:47.565	f	t	CONSUMABLE
cmjqno18500dimy1scfaje3wm	TERMIDOR SC (20oz)	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.573	2025-12-29 04:25:47.573	f	t	CONSUMABLE
cmjqno18j00dlmy1s5zqejdux	TERMIDOR SC (78oz)	\N	\N	CHEMICAL	MASS	oz	oz	78 oz bottle	1	1	78	\N	\N	\N	2025-12-29 04:25:47.588	2025-12-29 04:25:47.588	f	t	CONSUMABLE
cmjqno18t00domy1sa4tj7ci9	TIMBOR PROFESSIONAL	\N	\N	CHEMICAL	COUNT	each	each	case (8)	1	1	8	\N	\N	\N	2025-12-29 04:25:47.597	2025-12-29 04:25:47.597	f	t	CONSUMABLE
cmjqno19500drmy1s036dacsx	TOP CHOICE	\N	\N	CHEMICAL	MASS	lbs	oz	50 lb bag	16	1	800	\N	\N	\N	2025-12-29 04:25:47.609	2025-12-29 04:25:47.609	f	t	CONSUMABLE
cmjqno19h00dumy1sbhvyvb4w	TRANSPORT FC	\N	\N	CHEMICAL	COUNT	each	each	case (4)	1	1	4	\N	\N	\N	2025-12-29 04:25:47.622	2025-12-29 04:25:47.622	f	f	CONSUMABLE
cmjqno19q00dxmy1s83l7qffv	TRANSPORT MIKRON	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.63	2025-12-29 04:25:47.63	f	f	CONSUMABLE
cmjqno1a000e0my1sr7dx4st1	TRAPPER INSECT MONITOR	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.64	2025-12-29 04:25:47.64	f	t	CONSUMABLE
cmjqno1aa00e3my1s8kw7r7wv	TRELONA ATBS CARTRIDGE	\N	\N	CHEMICAL	COUNT	each	each	case (72)	1	1	72	\N	\N	\N	2025-12-29 04:25:47.651	2025-12-29 04:25:47.651	f	t	CONSUMABLE
cmjqno1al00e6my1ssw77rzcz	TRELONA ATBS STATIONS	\N	\N	CHEMICAL	COUNT	each	each	case (16)	1	1	16	\N	\N	\N	2025-12-29 04:25:47.661	2025-12-29 04:25:47.661	f	t	CONSUMABLE
cmjqno1ax00e9my1s6dopbdg0	TRUDETX BED BUG RAPID TEST	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.674	2025-12-29 04:25:47.674	f	t	CONSUMABLE
cmjqno1b800ecmy1she42kf0u	ULD BP-100 CONTACT INSECTICIDE	\N	\N	CHEMICAL	VOLUME	gal	fl oz	1 gal jug	128	1	128	\N	\N	\N	2025-12-29 04:25:47.685	2025-12-29 04:25:47.685	f	f	CONSUMABLE
cmjqno1bm00efmy1sdosfnukm	VENDETTA 360	\N	\N	CHEMICAL	COUNT	each	each	case (4)	1	1	4	\N	\N	\N	2025-12-29 04:25:47.698	2025-12-29 04:25:47.698	f	f	CONSUMABLE
cmjqno1c200eimy1sq73m455k	VENDETTA NITRO	\N	\N	CHEMICAL	COUNT	each	each	case (4)	1	1	4	\N	\N	\N	2025-12-29 04:25:47.714	2025-12-29 04:25:47.714	f	f	CONSUMABLE
cmjqno1ce00elmy1s7ayiz0yw	VENDETTA PLUS	\N	\N	CHEMICAL	COUNT	each	each	case (4)	1	1	4	\N	\N	\N	2025-12-29 04:25:47.727	2025-12-29 04:25:47.727	f	t	CONSUMABLE
cmjqno1cn00eomy1shevfrmyd	VICTOR PRO RAT SNAP TRAP	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.735	2025-12-29 04:25:47.735	f	t	CONSUMABLE
cmjqno1cy00ermy1s9pfpqctx	VICTOR SNAP TRAP - MICE	\N	\N	CHEMICAL	COUNT	each	each	case (72)	1	1	72	\N	\N	\N	2025-12-29 04:25:47.746	2025-12-29 04:25:47.746	f	t	CONSUMABLE
cmjqno1d900eumy1sr37sqnar	WEATHERBLOK-XT	\N	\N	CHEMICAL	MASS	oz	oz	1 oz bottle	1	1	1	\N	\N	\N	2025-12-29 04:25:47.757	2025-12-29 04:25:47.757	f	f	CONSUMABLE
cmjqno1di00exmy1s3vue6xga	WEB OUT	\N	\N	CHEMICAL	MASS	gal	fl oz	128 oz bottle	128	1	128	\N	\N	\N	2025-12-29 04:25:47.767	2025-12-29 04:25:47.767	f	f	CONSUMABLE
cmjqno1dr00f0my1sjl6j3a9v	WEBSTER HEAD (YELLOW)	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.776	2025-12-29 04:25:47.776	f	t	CONSUMABLE
cmjqno1e300f3my1s6pkjbbn2	WEBSTER POLE (20 FT)	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.787	2025-12-29 04:25:47.787	f	t	CONSUMABLE
cmjqno1ee00f6my1scfrgo4d2	WISDOM EZ	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.798	2025-12-29 04:25:47.798	f	t	CONSUMABLE
cmjqno1ep00f9my1s9e5cj5ry	XLURE RTU	\N	\N	CHEMICAL	COUNT	each	each	case (4)	1	1	4	\N	\N	\N	2025-12-29 04:25:47.81	2025-12-29 04:25:47.81	f	t	CONSUMABLE
cmjqno1f000fcmy1sa6sqnowq	ZENPROX WASP X2	\N	\N	CHEMICAL	COUNT	each	each	each	1	1	1	\N	\N	\N	2025-12-29 04:25:47.821	2025-12-29 04:25:47.821	f	t	CONSUMABLE
cmjvp5z4q0000myw7l0nv59ey	DROPLEX	\N	\N	CHEMICAL	VOLUME	gal	fl oz	2.5 gal jug	128	1	320	\N	\N	\N	2026-01-01 17:06:35.162	2026-01-01 17:06:35.162	f	f	CONSUMABLE
\.


--
-- Data for Name: ProductCode; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ProductCode" (id, "productId", "packId", "codeType", payload, "createdAt") FROM stdin;
cmjqno00o0002my1sp2zx49fq	cmjqno0030000my1sprl3ajh9	\N	sku	1991001	2025-12-29 04:25:46.008
cmjqno01f0005my1s62ln88nk	cmjqno0180003my1slmqx61lk	\N	sku	1991002	2025-12-29 04:25:46.035
cmjqno01s0008my1sb2p9uppd	cmjqno01m0006my1se4whmz7o	\N	sku	1991003	2025-12-29 04:25:46.049
cmjqno025000bmy1s4s3ildpl	cmjqno01y0009my1sstw6e11w	\N	sku	1991004	2025-12-29 04:25:46.061
cmjqno02i000emy1sxcllzvxc	cmjqno02c000cmy1sxsortew6	\N	sku	1991005	2025-12-29 04:25:46.074
cmjqno02u000hmy1shv9v584i	cmjqno02o000fmy1szxk4dsd4	\N	sku	1991006	2025-12-29 04:25:46.087
cmjqno036000kmy1s81dz1yzd	cmjqno030000imy1syend3obx	\N	sku	1991007	2025-12-29 04:25:46.098
cmjqno03h000nmy1smlhctjdq	cmjqno03c000lmy1ss210wlo6	\N	sku	1991008	2025-12-29 04:25:46.109
cmjqno03s000qmy1swpnp3vkh	cmjqno03n000omy1sfomzqeq7	\N	sku	1991009	2025-12-29 04:25:46.121
cmjqno042000tmy1s1d7dtmm3	cmjqno03y000rmy1skec7bs6p	\N	sku	1991010	2025-12-29 04:25:46.13
cmjqno04a000wmy1stds3r9bo	cmjqno046000umy1s8v95c9sw	\N	sku	1991011	2025-12-29 04:25:46.139
cmjqno04j000zmy1s6gdip5si	cmjqno04e000xmy1s4l72kcq6	\N	sku	1991012	2025-12-29 04:25:46.147
cmjqno04r0012my1sfbgb5cfl	cmjqno04n0010my1scsfh2nch	\N	sku	1991013	2025-12-29 04:25:46.155
cmjqno04z0015my1s98mase37	cmjqno04v0013my1spw3wcttr	\N	sku	1991014	2025-12-29 04:25:46.163
cmjqno0570018my1sx337px9i	cmjqno0530016my1sj6kd05or	\N	sku	1991015	2025-12-29 04:25:46.171
cmjqno05f001bmy1sdl9p57uk	cmjqno05b0019my1sv2rk9tvp	\N	sku	1991016	2025-12-29 04:25:46.18
cmjqno05o001emy1sxyvjos3f	cmjqno05j001cmy1s4pv84e47	\N	sku	1991017	2025-12-29 04:25:46.188
cmjqno05w001hmy1spf0uip6d	cmjqno05s001fmy1smzuq969d	\N	sku	1991018	2025-12-29 04:25:46.196
cmjqno065001kmy1sdb6b06j1	cmjqno060001imy1snk2z9gvn	\N	sku	1991019	2025-12-29 04:25:46.206
cmjqno06g001nmy1sfjtnkwre	cmjqno06a001lmy1srgs7s1yw	\N	sku	1991020	2025-12-29 04:25:46.216
cmjqno06r001qmy1sjftumyph	cmjqno06n001omy1s7bby80hv	\N	sku	1991021	2025-12-29 04:25:46.228
cmjqno071001tmy1sqzc3zeua	cmjqno06w001rmy1smz0mx0kh	\N	sku	1991022	2025-12-29 04:25:46.238
cmjqno07b001wmy1sjg65os5d	cmjqno076001umy1soz0adsum	\N	sku	1991023	2025-12-29 04:25:46.247
cmjqno07k001zmy1shysig2kt	cmjqno07g001xmy1s9woks2tb	\N	sku	1991024	2025-12-29 04:25:46.256
cmjqno07r0022my1s41dp1des	cmjqno07n0020my1s3zlg5f9v	\N	sku	1991025	2025-12-29 04:25:46.263
cmjqno07y0025my1sxkt8usls	cmjqno07v0023my1s0wfqtql2	\N	sku	1991026	2025-12-29 04:25:46.271
cmjqno0860028my1snolbh9ho	cmjqno0820026my1sja4mh5sf	\N	sku	1991027	2025-12-29 04:25:46.278
cmjqno08e002bmy1sa6oqu1yz	cmjqno08a0029my1sycc8uylf	\N	sku	1991028	2025-12-29 04:25:46.286
cmjqno08m002emy1s1aw5dgjj	cmjqno08i002cmy1sgfs513js	\N	sku	1991029	2025-12-29 04:25:46.294
cmjqno08t002hmy1swmc2dwwn	cmjqno08p002fmy1sn2qzzkcc	\N	sku	1991030	2025-12-29 04:25:46.301
cmjqno090002kmy1sirzosoqv	cmjqno08x002imy1s1or9o4uv	\N	sku	1991031	2025-12-29 04:25:46.309
cmjqno098002nmy1s1x51di39	cmjqno094002lmy1sles9c8k6	\N	sku	1991032	2025-12-29 04:25:46.317
cmjqno09h002qmy1s52gxmwu7	cmjqno09d002omy1sq0fjefql	\N	sku	1991033	2025-12-29 04:25:46.326
cmjqno09r002tmy1sllfomg9n	cmjqno09m002rmy1sytcvzck9	\N	sku	1991034	2025-12-29 04:25:46.335
cmjqno0a0002wmy1s051ucbvi	cmjqno09w002umy1s00enpdc7	\N	sku	1991035	2025-12-29 04:25:46.345
cmjqno0aa002zmy1siq81x8t5	cmjqno0a5002xmy1sw2hlsnke	\N	sku	1991036	2025-12-29 04:25:46.355
cmjqno0aj0032my1stm1nriif	cmjqno0af0030my1se085poy5	\N	sku	1991037	2025-12-29 04:25:46.364
cmjqno0ar0035my1s6r03uvck	cmjqno0ao0033my1scpwf168s	\N	sku	1991038	2025-12-29 04:25:46.372
cmjqno0b00038my1srzrrs2ot	cmjqno0av0036my1sdzetzen5	\N	sku	1991039	2025-12-29 04:25:46.38
cmjqno0b7003bmy1s1wlbl2li	cmjqno0b40039my1sri6lwesx	\N	sku	1991040	2025-12-29 04:25:46.388
cmjqno0be003emy1si6dhvlpu	cmjqno0bb003cmy1s5vlnwb2b	\N	sku	1991041	2025-12-29 04:25:46.395
cmjqno0bm003hmy1sqsya2234	cmjqno0bi003fmy1smhbzdcic	\N	sku	1991043	2025-12-29 04:25:46.402
cmjqno0bv003kmy1s2uej2qkc	cmjqno0br003imy1sewdy2nmy	\N	sku	1991044	2025-12-29 04:25:46.411
cmjqno0c2003nmy1s56jn4uwa	cmjqno0by003lmy1sdo6l0uij	\N	sku	1991045	2025-12-29 04:25:46.419
cmjqno0ca003qmy1sxct5ivmt	cmjqno0c6003omy1s30ilmfqx	\N	sku	1991046	2025-12-29 04:25:46.426
cmjqno0ch003tmy1somsnscvs	cmjqno0cd003rmy1skt761jdm	\N	sku	1991047	2025-12-29 04:25:46.433
cmjqno0cq003wmy1s9goo9dpb	cmjqno0cl003umy1s89ty8khl	\N	sku	1991048	2025-12-29 04:25:46.442
cmjqno0cy003zmy1sscceqml2	cmjqno0ct003xmy1s46smdyjj	\N	sku	1991049	2025-12-29 04:25:46.45
cmjqno0d50042my1sqxiar4q4	cmjqno0d20040my1s4g0k07an	\N	sku	1991050	2025-12-29 04:25:46.458
cmjqno0de0045my1shy4m68vz	cmjqno0d90043my1sgrf6ig0d	\N	sku	1991051	2025-12-29 04:25:46.466
cmjqno0dm0048my1s0j8k8f8s	cmjqno0di0046my1svbuvyzws	\N	sku	1991052	2025-12-29 04:25:46.475
cmjqno0dw004bmy1s5pqayu0v	cmjqno0dr0049my1sq04c53cj	\N	sku	1991053	2025-12-29 04:25:46.484
cmjqno0e4004emy1swelt3591	cmjqno0e0004cmy1s5zw1joe5	\N	sku	1991054	2025-12-29 04:25:46.492
cmjqno0eb004hmy1sb1vtlmyx	cmjqno0e8004fmy1s0gnyi973	\N	sku	1991055	2025-12-29 04:25:46.5
cmjqno0ej004kmy1sk1maq8mu	cmjqno0ef004imy1s8rcqidds	\N	sku	1991056	2025-12-29 04:25:46.507
cmjqno0eq004nmy1syd5pog4w	cmjqno0em004lmy1slmr9pgii	\N	sku	1991057	2025-12-29 04:25:46.514
cmjqno0ex004qmy1s2ghhtne1	cmjqno0et004omy1slvvcid2y	\N	sku	1991058	2025-12-29 04:25:46.522
cmjqno0f5004tmy1saag5j8ni	cmjqno0f1004rmy1s5wbbunlh	\N	sku	1991059	2025-12-29 04:25:46.53
cmjqno0fe004wmy1selc84i7o	cmjqno0f9004umy1sijbikrzj	\N	sku	1991060	2025-12-29 04:25:46.538
cmjqno0fl004zmy1shhgbd0a9	cmjqno0fh004xmy1smriqpt1u	\N	sku	1991061	2025-12-29 04:25:46.545
cmjqno0ft0052my1sott9fc4d	cmjqno0fp0050my1s5y7d3hu3	\N	sku	1991062	2025-12-29 04:25:46.553
cmjqno0g10055my1sgp8q9vxq	cmjqno0fx0053my1sj2uwwull	\N	sku	1991063	2025-12-29 04:25:46.561
cmjqno0g80058my1snq2kuc1h	cmjqno0g50056my1su9itk4oy	\N	sku	1991064	2025-12-29 04:25:46.568
cmjqno0gf005bmy1s9vtwslma	cmjqno0gb0059my1selmdlw9f	\N	sku	1991065	2025-12-29 04:25:46.575
cmjqno0gn005emy1skts9v6wr	cmjqno0gj005cmy1s73agplxo	\N	sku	1991066	2025-12-29 04:25:46.584
cmjqno0gv005hmy1sx20h1963	cmjqno0gr005fmy1sd74rsayv	\N	sku	1991067	2025-12-29 04:25:46.592
cmjqno0h3005kmy1srhxtuq8l	cmjqno0gz005imy1scpgoy62p	\N	sku	1991068	2025-12-29 04:25:46.6
cmjqno0hc005nmy1sf3qahkc8	cmjqno0h8005lmy1s8y9ngsw8	\N	sku	1991069	2025-12-29 04:25:46.609
cmjqno0hl005qmy1s8h035uix	cmjqno0hg005omy1stlep63uy	\N	sku	1991070	2025-12-29 04:25:46.617
cmjqno0i0005tmy1sghkzq1pm	cmjqno0ht005rmy1sr3bvxkzh	\N	sku	1991071	2025-12-29 04:25:46.632
cmjqno0id005wmy1sjgumfksj	cmjqno0i7005umy1si0086cg7	\N	sku	1991072	2025-12-29 04:25:46.646
cmjqno0in005zmy1sw8e5qvh0	cmjqno0ij005xmy1s7c00z7ji	\N	sku	1991073	2025-12-29 04:25:46.656
cmjqno0ix0062my1s54dll890	cmjqno0is0060my1skgsod4h2	\N	sku	1991074	2025-12-29 04:25:46.666
cmjqno0j50065my1scmsfnbai	cmjqno0j10063my1szgnd805t	\N	sku	1991075	2025-12-29 04:25:46.673
cmjqno0jd0068my1sc2v5ul7y	cmjqno0j90066my1sksdpw8ii	\N	sku	1991076	2025-12-29 04:25:46.681
cmjqno0jl006bmy1s9vyk39n5	cmjqno0jh0069my1sempl6rib	\N	sku	1991077	2025-12-29 04:25:46.689
cmjqno0js006emy1sfipwiibj	cmjqno0jo006cmy1so4kx7b3s	\N	sku	1991078	2025-12-29 04:25:46.697
cmjqno0k0006hmy1s3js4xfwz	cmjqno0jw006fmy1sclgmauk3	\N	sku	1991079	2025-12-29 04:25:46.705
cmjqno0k8006kmy1sse93sqlm	cmjqno0k4006imy1s6o3yfzu9	\N	sku	1991080	2025-12-29 04:25:46.712
cmjqno0kh006nmy1so5cji75v	cmjqno0kc006lmy1sa2jxxxmh	\N	sku	1991081	2025-12-29 04:25:46.721
cmjqno0kq006qmy1samypf264	cmjqno0kl006omy1sj6jkutct	\N	sku	1991082	2025-12-29 04:25:46.73
cmjqno0ky006tmy1stafmzg9v	cmjqno0ku006rmy1s7z4lqske	\N	sku	1991083	2025-12-29 04:25:46.739
cmjqno0l7006wmy1sd3rndfke	cmjqno0l2006umy1sp70ne45r	\N	sku	1991084	2025-12-29 04:25:46.747
cmjqno0lh006zmy1s4fl7vkrc	cmjqno0lc006xmy1suz1u2ve2	\N	sku	1991085	2025-12-29 04:25:46.757
cmjqno0lq0072my1sjoauzx00	cmjqno0ll0070my1snl8s6v8n	\N	sku	1991086	2025-12-29 04:25:46.766
cmjqno0ly0075my1sxg73gxgd	cmjqno0lu0073my1sddkfv8er	\N	sku	1991087	2025-12-29 04:25:46.775
cmjqno0m60078my1sarteu34y	cmjqno0m20076my1s5j4uq4oo	\N	sku	1991088	2025-12-29 04:25:46.783
cmjqno0mg007bmy1soy8dkir1	cmjqno0ma0079my1sfrw1wbda	\N	sku	1991089	2025-12-29 04:25:46.792
cmjqno0mp007emy1sk1onp2bl	cmjqno0mk007cmy1syudhfgey	\N	sku	1991090	2025-12-29 04:25:46.801
cmjqno0my007hmy1s45t6p2x9	cmjqno0mt007fmy1sct2eaqw2	\N	sku	1991091	2025-12-29 04:25:46.81
cmjqno0n7007kmy1sezt4527q	cmjqno0n3007imy1s7xoebaru	\N	sku	1991092	2025-12-29 04:25:46.819
cmjqno0nh007nmy1shhkvl1nd	cmjqno0nd007lmy1sommwbphf	\N	sku	1991093	2025-12-29 04:25:46.83
cmjqno0ns007qmy1sn0a8ql78	cmjqno0nn007omy1sivxf04xk	\N	sku	1991094	2025-12-29 04:25:46.841
cmjqno0o2007tmy1s1exczuiz	cmjqno0nw007rmy1s8ar2ddx8	\N	sku	1991095	2025-12-29 04:25:46.85
cmjqno0ob007wmy1sipb8uyqc	cmjqno0o6007umy1s4uscg5f2	\N	sku	1991096	2025-12-29 04:25:46.86
cmjqno0ol007zmy1segjp0573	cmjqno0og007xmy1sv6bfshg5	\N	sku	1991097	2025-12-29 04:25:46.869
cmjqno0ot0082my1spen20q7i	cmjqno0op0080my1sztbhbcpd	\N	sku	1991098	2025-12-29 04:25:46.878
cmjqno0p20085my1sa2c8g3cm	cmjqno0oy0083my1sh5sc3472	\N	sku	1991099	2025-12-29 04:25:46.886
cmjqno0pb0088my1slxxiaki0	cmjqno0p60086my1so5ozbrnt	\N	sku	1991100	2025-12-29 04:25:46.895
cmjqno0pj008bmy1so8kqsak0	cmjqno0pf0089my1snnk797ip	\N	sku	1991101	2025-12-29 04:25:46.904
cmjqno0ps008emy1spyx8h0hd	cmjqno0po008cmy1sstpu8t5o	\N	sku	1991102	2025-12-29 04:25:46.912
cmjqno0q1008hmy1ssup1o580	cmjqno0pw008fmy1scglwighf	\N	sku	1991103	2025-12-29 04:25:46.921
cmjqno0qa008kmy1sx2cyl2o4	cmjqno0q6008imy1sjq8chc9p	\N	sku	1991104	2025-12-29 04:25:46.93
cmjqno0qi008nmy1sajxbqf1b	cmjqno0qe008lmy1sw3xkbogz	\N	sku	1991105	2025-12-29 04:25:46.938
cmjqno0qs008qmy1si3zkxfvo	cmjqno0qo008omy1shg16tl9x	\N	sku	1991106	2025-12-29 04:25:46.948
cmjqno0r6008tmy1snfp4yrfi	cmjqno0r1008rmy1sjqfzphz0	\N	sku	1991107	2025-12-29 04:25:46.963
cmjqno0rg008wmy1sigez85xb	cmjqno0rd008umy1snu2dwolv	\N	sku	1991108	2025-12-29 04:25:46.973
cmjqno0ro008zmy1sshw21yqs	cmjqno0rk008xmy1sj346xj2v	\N	sku	1991109	2025-12-29 04:25:46.981
cmjqno0rx0092my1sq081wpk8	cmjqno0rt0090my1sk1umz595	\N	sku	1991110	2025-12-29 04:25:46.99
cmjqno0s60095my1s6rb48pme	cmjqno0s20093my1s1oje6uem	\N	sku	1991111	2025-12-29 04:25:46.999
cmjqno0sh0098my1sv5fpgjn5	cmjqno0sc0096my1s2feu8e2s	\N	sku	1991112	2025-12-29 04:25:47.01
cmjqno0sq009bmy1srkil2kkg	cmjqno0sm0099my1s1ka0cdob	\N	sku	1991113	2025-12-29 04:25:47.019
cmjqno0t0009emy1seyjmqabz	cmjqno0sv009cmy1srkhog05k	\N	sku	1991114	2025-12-29 04:25:47.029
cmjqno0ta009hmy1sv6bf0ziq	cmjqno0t5009fmy1sf6e88t53	\N	sku	1991115	2025-12-29 04:25:47.038
cmjqno0tk009kmy1sh4zkm08m	cmjqno0te009imy1soh67goun	\N	sku	1991116	2025-12-29 04:25:47.048
cmjqno0tv009nmy1svz454ykf	cmjqno0tp009lmy1souhdrd5p	\N	sku	1991117	2025-12-29 04:25:47.06
cmjqno0u7009qmy1s096bvfsu	cmjqno0u1009omy1sbndrfd68	\N	sku	1991118	2025-12-29 04:25:47.071
cmjqno0um009tmy1s5sdr9zlv	cmjqno0uf009rmy1s5ajkdu4l	\N	sku	1991119	2025-12-29 04:25:47.086
cmjqno0uz009wmy1s8ur6363w	cmjqno0us009umy1s1qowgha7	\N	sku	1991120	2025-12-29 04:25:47.1
cmjqno0vf009zmy1sns2ca6kh	cmjqno0v8009xmy1sudlemhvd	\N	sku	1991121	2025-12-29 04:25:47.115
cmjqno0vq00a2my1srnr10p1m	cmjqno0vl00a0my1s27wjda95	\N	sku	1991122	2025-12-29 04:25:47.127
cmjqno0w100a5my1s17ry1cfm	cmjqno0vw00a3my1s2emzbm8i	\N	sku	1991123	2025-12-29 04:25:47.138
cmjqno0wc00a8my1s1lvz7rrv	cmjqno0w700a6my1sth1rs7tf	\N	sku	1991124	2025-12-29 04:25:47.148
cmjqno0wm00abmy1stp0farq6	cmjqno0wh00a9my1szcwdds1t	\N	sku	1991125	2025-12-29 04:25:47.159
cmjqno0ww00aemy1s2v3xz9ao	cmjqno0wr00acmy1s1jw9cdmu	\N	sku	1991126	2025-12-29 04:25:47.169
cmjqno0x600ahmy1syagunus1	cmjqno0x100afmy1sonxakg5h	\N	sku	1991127	2025-12-29 04:25:47.178
cmjqno0xf00akmy1s87duyian	cmjqno0xa00aimy1stqgf2jii	\N	sku	1991128	2025-12-29 04:25:47.188
cmjqno0xp00anmy1soz5l33pu	cmjqno0xk00almy1sp55aujm8	\N	sku	1991129	2025-12-29 04:25:47.198
cmjqno0y000aqmy1s8yip85cd	cmjqno0xu00aomy1st71mojb8	\N	sku	1991130	2025-12-29 04:25:47.208
cmjqno0yc00atmy1sxdtgqfcc	cmjqno0y600army1sbh7m6ovr	\N	sku	1991131	2025-12-29 04:25:47.22
cmjqno0ym00awmy1sjvekmb7e	cmjqno0yh00aumy1s1a6yjbyh	\N	sku	1991132	2025-12-29 04:25:47.23
cmjqno0yx00azmy1s2zwwoazf	cmjqno0ys00axmy1ssln3ovlx	\N	sku	1991133	2025-12-29 04:25:47.242
cmjqno0z700b2my1satfch1qw	cmjqno0z200b0my1sncqj50i2	\N	sku	1991134	2025-12-29 04:25:47.252
cmjqno0zh00b5my1s9w9vfqn4	cmjqno0zc00b3my1srzljm87d	\N	sku	1991135	2025-12-29 04:25:47.261
cmjqno0zt00b8my1sokp7qe15	cmjqno0zm00b6my1s96d0wu71	\N	sku	1991136	2025-12-29 04:25:47.274
cmjqno10600bbmy1sym76h5e8	cmjqno0zz00b9my1s24jq7ly8	\N	sku	1991137	2025-12-29 04:25:47.286
cmjqno10i00bemy1s50tkn3yi	cmjqno10c00bcmy1sh38bn45k	\N	sku	1991138	2025-12-29 04:25:47.299
cmjqno10x00bhmy1s9dooe8ug	cmjqno10q00bfmy1sqekllt8x	\N	sku	1991139	2025-12-29 04:25:47.313
cmjqno11800bkmy1s1c867vqe	cmjqno11200bimy1sszkfdp69	\N	sku	1991140	2025-12-29 04:25:47.324
cmjqno11m00bnmy1sjccjij5e	cmjqno11g00blmy1s6ec9f42t	\N	sku	1991141	2025-12-29 04:25:47.338
cmjqno11w00bqmy1sovpm5o7j	cmjqno11r00bomy1s19u54qds	\N	sku	1991142	2025-12-29 04:25:47.348
cmjqno12c00btmy1sc9wghdj5	cmjqno12400brmy1sx4sgzddj	\N	sku	1991143	2025-12-29 04:25:47.364
cmjqno12o00bwmy1s8wie4jut	cmjqno12j00bumy1sgwyurrgi	\N	sku	1991144	2025-12-29 04:25:47.377
cmjqno12x00bzmy1s32uc94ug	cmjqno12t00bxmy1sbnhcfmao	\N	sku	1991145	2025-12-29 04:25:47.386
cmjqno13700c2my1sxvmf63i4	cmjqno13300c0my1sxlumsydl	\N	sku	1991146	2025-12-29 04:25:47.396
cmjqno13i00c5my1sp7jy98p6	cmjqno13b00c3my1s5ert0nt9	\N	sku	1991147	2025-12-29 04:25:47.407
cmjqno13r00c8my1steh313rw	cmjqno13n00c6my1so8d0z9yf	\N	sku	1991148	2025-12-29 04:25:47.416
cmjqno14300cbmy1sp97xzwuk	cmjqno13v00c9my1squ8yho5w	\N	sku	1991149	2025-12-29 04:25:47.428
cmjqno14f00cemy1s1l67tdpy	cmjqno14900ccmy1su0x83h4x	\N	sku	1991150	2025-12-29 04:25:47.439
cmjqno14o00chmy1s20uk4qdm	cmjqno14k00cfmy1syhhalf4v	\N	sku	1991151	2025-12-29 04:25:47.449
cmjqno14z00ckmy1srivi1mry	cmjqno14u00cimy1s0t8teld0	\N	sku	1991152	2025-12-29 04:25:47.459
cmjqno15900cnmy1scxhjjpf1	cmjqno15400clmy1sm393t9tk	\N	sku	1991153	2025-12-29 04:25:47.469
cmjqno15j00cqmy1st74boq34	cmjqno15d00comy1s14i2k5hw	\N	sku	1991154	2025-12-29 04:25:47.48
cmjqno15t00ctmy1s3r0e9zbi	cmjqno15o00crmy1svr7o30bd	\N	sku	1991155	2025-12-29 04:25:47.49
cmjqno16500cwmy1sy4d0x51x	cmjqno16000cumy1smpuccxkp	\N	sku	1991156	2025-12-29 04:25:47.501
cmjqno16f00czmy1sy9l6saba	cmjqno16900cxmy1sy2ouy747	\N	sku	1991157	2025-12-29 04:25:47.511
cmjqno16o00d2my1sjqr1pbot	cmjqno16j00d0my1swpw76q2n	\N	sku	1991158	2025-12-29 04:25:47.52
cmjqno16y00d5my1sawah5ipk	cmjqno16t00d3my1s3ewn4962	\N	sku	1991159	2025-12-29 04:25:47.53
cmjqno17700d8my1sf4uh9yxw	cmjqno17200d6my1sgc8ncg32	\N	sku	1991160	2025-12-29 04:25:47.54
cmjqno17k00dbmy1st66bxixm	cmjqno17e00d9my1sfjhb5s81	\N	sku	1991161	2025-12-29 04:25:47.552
cmjqno17s00demy1s8pmwgqd1	cmjqno17o00dcmy1s1d25skl1	\N	sku	1991162	2025-12-29 04:25:47.561
cmjqno18000dhmy1se4xcdxzy	cmjqno17w00dfmy1syh7ullcf	\N	sku	1991163	2025-12-29 04:25:47.569
cmjqno18d00dkmy1sr91nb4pu	cmjqno18500dimy1scfaje3wm	\N	sku	1991164	2025-12-29 04:25:47.581
cmjqno18p00dnmy1s2q8op5dx	cmjqno18j00dlmy1s5zqejdux	\N	sku	1991165	2025-12-29 04:25:47.593
cmjqno18y00dqmy1swsxlh2ee	cmjqno18t00domy1sa4tj7ci9	\N	sku	1991166	2025-12-29 04:25:47.602
cmjqno19b00dtmy1sbpsiek5n	cmjqno19500drmy1s036dacsx	\N	sku	1991167	2025-12-29 04:25:47.616
cmjqno19m00dwmy1sci6bcfuu	cmjqno19h00dumy1sbhvyvb4w	\N	sku	1991168	2025-12-29 04:25:47.626
cmjqno19v00dzmy1shc2kkbpi	cmjqno19q00dxmy1s83l7qffv	\N	sku	1991169	2025-12-29 04:25:47.636
cmjqno1a400e2my1s19c76vmc	cmjqno1a000e0my1sr7dx4st1	\N	sku	1991170	2025-12-29 04:25:47.644
cmjqno1ag00e5my1s31lqitcg	cmjqno1aa00e3my1s8kw7r7wv	\N	sku	1991171	2025-12-29 04:25:47.656
cmjqno1as00e8my1salccz5ly	cmjqno1al00e6my1ssw77rzcz	\N	sku	1991172	2025-12-29 04:25:47.668
cmjqno1b300ebmy1sl4dbtu8n	cmjqno1ax00e9my1s6dopbdg0	\N	sku	1991173	2025-12-29 04:25:47.679
cmjqno1bg00eemy1s05t8e0h1	cmjqno1b800ecmy1she42kf0u	\N	sku	1991174	2025-12-29 04:25:47.692
cmjqno1bs00ehmy1scxfeidfe	cmjqno1bm00efmy1sdosfnukm	\N	sku	1991175	2025-12-29 04:25:47.705
cmjqno1ca00ekmy1sai7qzqag	cmjqno1c200eimy1sq73m455k	\N	sku	1991176	2025-12-29 04:25:47.722
cmjqno1cj00enmy1s9vjz54de	cmjqno1ce00elmy1s7ayiz0yw	\N	sku	1991177	2025-12-29 04:25:47.731
cmjqno1ct00eqmy1sr6vjum47	cmjqno1cn00eomy1shevfrmyd	\N	sku	1991178	2025-12-29 04:25:47.742
cmjqno1d200etmy1sm0d4r7on	cmjqno1cy00ermy1s9pfpqctx	\N	sku	1991179	2025-12-29 04:25:47.75
cmjqno1dd00ewmy1sru9p34iy	cmjqno1d900eumy1sr37sqnar	\N	sku	1991180	2025-12-29 04:25:47.762
cmjqno1dn00ezmy1s93wseut5	cmjqno1di00exmy1s3vue6xga	\N	sku	1991181	2025-12-29 04:25:47.772
cmjqno1dw00f2my1smv9q1ysi	cmjqno1dr00f0my1sjl6j3a9v	\N	sku	1991182	2025-12-29 04:25:47.78
cmjqno1e900f5my1sptyois1q	cmjqno1e300f3my1s6pkjbbn2	\N	sku	1991183	2025-12-29 04:25:47.794
cmjqno1ej00f8my1stzu33wrn	cmjqno1ee00f6my1scfrgo4d2	\N	sku	1991184	2025-12-29 04:25:47.804
cmjqno1ev00fbmy1sf0bi19ze	cmjqno1ep00f9my1s9e5cj5ry	\N	sku	1991185	2025-12-29 04:25:47.816
cmjqno1f500femy1sm3xdidq4	cmjqno1f000fcmy1sa6sqnowq	\N	sku	1991186	2025-12-29 04:25:47.825
cmjvp5z520002myw7l4k3jdic	cmjvp5z4q0000myw7l0nv59ey	\N	sku	1991042	2026-01-01 17:06:35.175
\.


--
-- Data for Name: ProductPack; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ProductPack" (id, "productId", name, "quantityPerPack", "orderingToBase", "createdAt") FROM stdin;
\.


--
-- Data for Name: ReasonCode; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ReasonCode" (id, name, description, active) FROM stdin;
\.


--
-- Data for Name: ReorderPolicy; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ReorderPolicy" (id, "productId", "reorderLevelBase", "targetDaysOfSupply", supplier, "leadTimeDays", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Setting; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Setting" (key, value, "updatedAt") FROM stdin;
\.


--
-- Data for Name: Technician; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Technician" (id, name, active, "createdAt", "updatedAt") FROM stdin;
cmjwe4b7e0000p4nzfz9tnbt5	Addison Wilkerson	t	2026-01-02 04:45:07.891	2026-01-02 04:44:05.707
cmjwe4b7e0001p4nzqq3ithwo	Austin Lowe	t	2026-01-02 04:45:07.891	2026-01-02 04:44:21.402
cmjwe4b7e0002p4nz9l1t6au8	Denzel Preslar	t	2026-01-02 04:45:07.891	2026-01-02 04:44:36.502
cmjwe4b7f0003p4nzqq3io96j	Ed Valencia	t	2026-01-02 04:45:07.891	2026-01-02 04:44:47.925
cmjwe4b7f0004p4nzp8bt7g54	Eric Stephan	t	2026-01-02 04:45:07.891	2026-01-06 02:10:31.961
\.


--
-- Data for Name: TransferRequest; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."TransferRequest" (id, "createdAt", "updatedAt", "createdByUserId", "technicianId", direction, "fromScope", "toScope", status, reason, "submittedAt", "finalizedAt", "finalizedByUserId", "acknowledgedAt", "acknowledgedByUserId", "disputeNote", "requestIdempotencyKey") FROM stdin;
cmk1yicvr0001rq89habkt975	2026-01-06 02:14:46.453	2026-01-08 20:12:11.391	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	cmjwe4b7e0000p4nzfz9tnbt5	ISSUE	WAREHOUSE	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	ACKNOWLEDGED		2026-01-06 02:14:46.453	2026-01-06 02:15:17.091	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	2026-01-08 20:12:11.388	6ba10838-9341-49d6-abfa-9f85e0c66fa4	\N	\N
cmkfclucs0001rf7z169ekie0	2026-01-15 11:10:23.979	2026-01-15 11:17:59.396	6ba10838-9341-49d6-abfa-9f85e0c66fa4	cmjwe4b7e0000p4nzfz9tnbt5	ISSUE	WAREHOUSE	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	ACKNOWLEDGED		2026-01-15 11:10:23.979	2026-01-15 11:11:08.42	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	2026-01-15 11:17:59.395	6ba10838-9341-49d6-abfa-9f85e0c66fa4	\N	\N
cmkfqz5o50001xhkcvt0qc545	2026-01-15 17:52:39.794	2026-01-15 21:33:07.54	6ba10838-9341-49d6-abfa-9f85e0c66fa4	cmjwe4b7e0000p4nzfz9tnbt5	ISSUE	WAREHOUSE	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	ACKNOWLEDGED		2026-01-15 17:52:39.794	2026-01-15 21:32:08.666	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	2026-01-15 21:33:07.539	6ba10838-9341-49d6-abfa-9f85e0c66fa4	\N	\N
cmkg6gmoz000112cne2pnj8f4	2026-01-16 01:06:09.25	2026-01-16 01:06:57.597	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	cmjwe4b7e0000p4nzfz9tnbt5	ISSUE	WAREHOUSE	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	ACKNOWLEDGED		2026-01-16 01:06:09.25	2026-01-16 01:06:23.739	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	2026-01-16 01:06:57.596	6ba10838-9341-49d6-abfa-9f85e0c66fa4	\N	\N
cmkg3uufc0001bi3zpc2f5jd3	2026-01-15 23:53:13.608	2026-01-16 01:07:00.478	6ba10838-9341-49d6-abfa-9f85e0c66fa4	cmjwe4b7e0000p4nzfz9tnbt5	ISSUE	WAREHOUSE	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	ACKNOWLEDGED		2026-01-15 23:53:13.608	2026-01-16 01:06:19.165	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	2026-01-16 01:07:00.477	6ba10838-9341-49d6-abfa-9f85e0c66fa4	\N	\N
cmkg6matl001712cn95k0vtvb	2026-01-16 01:10:33.802	2026-01-16 01:12:59.212	6ba10838-9341-49d6-abfa-9f85e0c66fa4	cmjwe4b7e0000p4nzfz9tnbt5	ISSUE	WAREHOUSE	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	ACKNOWLEDGED		2026-01-16 01:10:33.802	2026-01-16 01:12:21.039	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	2026-01-16 01:12:59.211	6ba10838-9341-49d6-abfa-9f85e0c66fa4	\N	\N
cmkg6m6y6001312cnpgq7s4gy	2026-01-16 01:10:28.783	2026-01-16 01:19:41.158	6ba10838-9341-49d6-abfa-9f85e0c66fa4	cmjwe4b7e0000p4nzfz9tnbt5	ISSUE	WAREHOUSE	TRUCK:cmjwe4b7e0000p4nzfz9tnbt5	ACKNOWLEDGED		2026-01-16 01:10:28.783	2026-01-16 01:19:31.751	8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	2026-01-16 01:19:41.157	6ba10838-9341-49d6-abfa-9f85e0c66fa4	\N	\N
\.


--
-- Data for Name: TransferRequestLine; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."TransferRequestLine" (id, "transferRequestId", "productId", quantity, "unitLabel") FROM stdin;
cmk1yicvr0003rq89etqgpbek	cmk1yicvr0001rq89habkt975	cmjqno0030000my1sprl3ajh9	1	COUNT
cmk1yicvr0004rq892x79zdk3	cmk1yicvr0001rq89habkt975	cmjqno0180003my1slmqx61lk	1	COUNT
cmkfclucs0003rf7z6xs6l5pi	cmkfclucs0001rf7z169ekie0	cmjqno0030000my1sprl3ajh9	1	each
cmkfclucs0004rf7zarpq181y	cmkfclucs0001rf7z169ekie0	cmjqno15d00comy1s14i2k5hw	1	each
cmkfqz5o50003xhkcjlpm9dps	cmkfqz5o50001xhkcvt0qc545	cmjqno17w00dfmy1syh7ullcf	1	each
cmkfqz5o50004xhkc387q6gf5	cmkfqz5o50001xhkcvt0qc545	cmjqno0a5002xmy1sw2hlsnke	1	each
cmkg3uufc0003bi3zy8dxlay3	cmkg3uufc0001bi3zpc2f5jd3	cmjqno05s001fmy1smzuq969d	1	each
cmkg3uufc0004bi3zwef8orbc	cmkg3uufc0001bi3zpc2f5jd3	cmjqno0530016my1sj6kd05or	1	each
cmkg3uufc0005bi3z826fw9ij	cmkg3uufc0001bi3zpc2f5jd3	cmjqno1ce00elmy1s7ayiz0yw	1	each
cmkg6gmoz000312cnvhe73udl	cmkg6gmoz000112cne2pnj8f4	cmjqno0180003my1slmqx61lk	1	each
cmkg6m6y6001512cn6870xbl9	cmkg6m6y6001312cnpgq7s4gy	cmjqno05s001fmy1smzuq969d	1	each
cmkg6matl001912cn3cxuemvd	cmkg6matl001712cn95k0vtvb	cmjqno0530016my1sj6kd05or	1	each
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."User" (id, email, name, role, location, "createdAt", "updatedAt", "passwordHash", "technicianId", active) FROM stdin;
8d77e253-b2ea-4ddc-96a3-783cbeabc3dc	admin@local.com	Admin	ADMIN	\N	2026-01-04 19:09:25.743	2026-01-04 19:09:25.743	$2a$10$PrQYeXlzDiD.ObDvGy4LZOHkZmA2V2AJDO70Qafp9ellsppLl6BDK	\N	t
a9a6ab36-d18e-4455-a681-adf1ee8ba0df	tech@local.com	Test Tech	TECH	\N	2026-01-08 20:07:52.485	2026-01-08 20:09:01.43	$2a$10$0JB9Isqqln/v4KhfRPzJT.43b6uaU00w75Eo3QKgqNISPD1OVk296	cmjwe4b7e0000p4nzfz9tnbt5	t
6ba10838-9341-49d6-abfa-9f85e0c66fa4	tech@local.test	Test Tech	TECH	\N	2026-01-08 20:06:03.367	2026-01-08 20:09:46.014	$2a$10$0JB9Isqqln/v4KhfRPzJT.43b6uaU00w75Eo3QKgqNISPD1OVk296	cmjwe4b7e0000p4nzfz9tnbt5	t
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
6d9342f1-993f-4083-976e-2a0bc8d7c6d7	9813a498face6c5f7391c264327f0fe46cee7e6a97526fec923311c759a5ada8	2025-12-27 17:57:14.602962+00	20251221022419_product_name_unique	\N	\N	2025-12-27 17:57:14.36801+00	1
6e92ba6e-fdaf-4bb6-8ab2-97165e76e7e7	458870b927137bc14796bb43eaf8b32ee218b63b5720809a8527b0837551b633	2025-12-27 17:57:15.575874+00	20251227175715_add_product_lifecycle_flags	\N	\N	2025-12-27 17:57:15.565816+00	1
7b88d974-95da-47c2-b726-d67b42bded24	060f7e0584b19bcd1ef54e8cefe62ccccc844fddacfbafeb333d823593967cd8	2026-01-02 03:44:39.919705+00	20260101_scope_inventory	\N	\N	2026-01-02 03:44:39.832085+00	1
3cc95a68-aff4-46d0-b178-dd03f14256a9	452963e78b2479e7b60c53de8a32afa0e2b979f1cf3fd7832649e3fe3659e658	2026-01-02 03:46:06.02237+00	20260102034605_scoped_inventory_and_transfers	\N	\N	2026-01-02 03:46:06.010053+00	1
3ef3b679-813f-41b4-895d-640f73ca3e3c	10a0f1b5052a7e2275686d252b3685ef35ae2795a51e329fb7eb4b525ceb0ed6	2026-01-02 04:40:51.993836+00	20260102044051_add_technician_table	\N	\N	2026-01-02 04:40:51.964903+00	1
2f94be44-4779-4ec1-9321-6f364229a379	de2fc3f34ed8502535f748389bdeb80dc3df89409c2850330266cd51bc62aa2a	\N	20260103_transfer_requests	A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve\n\nMigration name: 20260103_transfer_requests\n\nDatabase error code: 22P02\n\nDatabase error:\nERROR: invalid input value for enum "Role": "WAREHOUSE"\n\nPosition:\n[1m 11[0m   ALTER COLUMN "actorRole" TYPE "Role_new" USING (\n[1m 12[0m     CASE\n[1m 13[0m       WHEN "actorRole" = 'ADMIN' THEN 'ADMIN'::"Role_new"\n[1m 14[0m       WHEN "actorRole" = 'INVENTORY_MANAGER' THEN 'MANAGER'::"Role_new"\n[1m 15[0m       WHEN "actorRole" = 'TECHNICIAN' THEN 'TECH'::"Role_new"\n[1m 16[1;31m       WHEN "actorRole" = 'WAREHOUSE' THEN 'WAREHOUSE'::"Role_new"[0m\n\nDbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E22P02), message: "invalid input value for enum \\"Role\\": \\"WAREHOUSE\\"", detail: None, hint: None, position: Some(Original(557)), where_: None, schema: None, table: None, column: None, datatype: None, constraint: None, file: Some("enum.c"), line: Some(128), routine: Some("enum_in") }\n\n   0: sql_schema_connector::apply_migration::apply_script\n           with migration_name="20260103_transfer_requests"\n             at schema-engine/connectors/sql-schema-connector/src/apply_migration.rs:106\n   1: schema_core::commands::apply_migrations::Applying migration\n           with migration_name="20260103_transfer_requests"\n             at schema-engine/core/src/commands/apply_migrations.rs:91\n   2: schema_core::state::ApplyMigrations\n             at schema-engine/core/src/state.rs:226	2026-01-03 06:59:04.050356+00	2026-01-03 06:38:59.229305+00	0
480b58d9-2f28-47d5-ac4c-e676dfb9835a	96bf8465601a67537a5bd78754f6930dd62975d8f164b8c446c74dbfe8a3bca8	2026-01-03 06:59:19.159831+00	20260103_transfer_requests	\N	\N	2026-01-03 06:59:18.937208+00	1
\.


--
-- Name: CheckoutLine CheckoutLine_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CheckoutLine"
    ADD CONSTRAINT "CheckoutLine_pkey" PRIMARY KEY (id);


--
-- Name: CheckoutRequest CheckoutRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CheckoutRequest"
    ADD CONSTRAINT "CheckoutRequest_pkey" PRIMARY KEY (id);


--
-- Name: IncomingLine IncomingLine_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IncomingLine"
    ADD CONSTRAINT "IncomingLine_pkey" PRIMARY KEY (id);


--
-- Name: IncomingReceipt IncomingReceipt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IncomingReceipt"
    ADD CONSTRAINT "IncomingReceipt_pkey" PRIMARY KEY (id);


--
-- Name: InventoryBalance InventoryBalance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryBalance"
    ADD CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY (id);


--
-- Name: InventoryTransaction InventoryTransaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryTransaction"
    ADD CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY (id);


--
-- Name: Notification Notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_pkey" PRIMARY KEY (id);


--
-- Name: ProductCode ProductCode_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductCode"
    ADD CONSTRAINT "ProductCode_pkey" PRIMARY KEY (id);


--
-- Name: ProductPack ProductPack_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductPack"
    ADD CONSTRAINT "ProductPack_pkey" PRIMARY KEY (id);


--
-- Name: Product Product_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_pkey" PRIMARY KEY (id);


--
-- Name: ReasonCode ReasonCode_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReasonCode"
    ADD CONSTRAINT "ReasonCode_pkey" PRIMARY KEY (id);


--
-- Name: ReorderPolicy ReorderPolicy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReorderPolicy"
    ADD CONSTRAINT "ReorderPolicy_pkey" PRIMARY KEY (id);


--
-- Name: Setting Setting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Setting"
    ADD CONSTRAINT "Setting_pkey" PRIMARY KEY (key);


--
-- Name: Technician Technician_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Technician"
    ADD CONSTRAINT "Technician_pkey" PRIMARY KEY (id);


--
-- Name: TransferRequestLine TransferRequestLine_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransferRequestLine"
    ADD CONSTRAINT "TransferRequestLine_pkey" PRIMARY KEY (id);


--
-- Name: TransferRequest TransferRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransferRequest"
    ADD CONSTRAINT "TransferRequest_pkey" PRIMARY KEY (id);


--
-- Name: TransferRequest TransferRequest_requestIdempotencyKey_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransferRequest"
    ADD CONSTRAINT "TransferRequest_requestIdempotencyKey_key" UNIQUE ("requestIdempotencyKey");


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: InventoryBalance_productId_scope_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InventoryBalance_productId_scope_key" ON public."InventoryBalance" USING btree ("productId", scope);


--
-- Name: InventoryTransaction_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InventoryTransaction_idempotencyKey_key" ON public."InventoryTransaction" USING btree ("idempotencyKey");


--
-- Name: InventoryTransaction_transferIdempotencyKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InventoryTransaction_transferIdempotencyKey_idx" ON public."InventoryTransaction" USING btree ("transferIdempotencyKey");


--
-- Name: ProductCode_payload_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProductCode_payload_key" ON public."ProductCode" USING btree (payload);


--
-- Name: Product_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Product_name_key" ON public."Product" USING btree (name);


--
-- Name: ReorderPolicy_productId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ReorderPolicy_productId_key" ON public."ReorderPolicy" USING btree ("productId");


--
-- Name: TransferRequest_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TransferRequest_createdAt_idx" ON public."TransferRequest" USING btree ("createdAt");


--
-- Name: TransferRequest_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TransferRequest_status_idx" ON public."TransferRequest" USING btree (status);


--
-- Name: TransferRequest_technicianId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TransferRequest_technicianId_idx" ON public."TransferRequest" USING btree ("technicianId");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: CheckoutLine CheckoutLine_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CheckoutLine"
    ADD CONSTRAINT "CheckoutLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CheckoutLine CheckoutLine_requestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CheckoutLine"
    ADD CONSTRAINT "CheckoutLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES public."CheckoutRequest"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CheckoutRequest CheckoutRequest_technicianId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CheckoutRequest"
    ADD CONSTRAINT "CheckoutRequest_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: IncomingLine IncomingLine_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IncomingLine"
    ADD CONSTRAINT "IncomingLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: IncomingLine IncomingLine_receiptId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IncomingLine"
    ADD CONSTRAINT "IncomingLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES public."IncomingReceipt"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: IncomingReceipt IncomingReceipt_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IncomingReceipt"
    ADD CONSTRAINT "IncomingReceipt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InventoryBalance InventoryBalance_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryBalance"
    ADD CONSTRAINT "InventoryBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InventoryTransaction InventoryTransaction_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryTransaction"
    ADD CONSTRAINT "InventoryTransaction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryTransaction InventoryTransaction_checkoutLineId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryTransaction"
    ADD CONSTRAINT "InventoryTransaction_checkoutLineId_fkey" FOREIGN KEY ("checkoutLineId") REFERENCES public."CheckoutLine"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryTransaction InventoryTransaction_incomingLineId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryTransaction"
    ADD CONSTRAINT "InventoryTransaction_incomingLineId_fkey" FOREIGN KEY ("incomingLineId") REFERENCES public."IncomingLine"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryTransaction InventoryTransaction_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryTransaction"
    ADD CONSTRAINT "InventoryTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Notification Notification_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProductCode ProductCode_packId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductCode"
    ADD CONSTRAINT "ProductCode_packId_fkey" FOREIGN KEY ("packId") REFERENCES public."ProductPack"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ProductCode ProductCode_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductCode"
    ADD CONSTRAINT "ProductCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProductPack ProductPack_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductPack"
    ADD CONSTRAINT "ProductPack_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ReorderPolicy ReorderPolicy_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReorderPolicy"
    ADD CONSTRAINT "ReorderPolicy_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TransferRequestLine TransferRequestLine_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransferRequestLine"
    ADD CONSTRAINT "TransferRequestLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TransferRequestLine TransferRequestLine_transferRequestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransferRequestLine"
    ADD CONSTRAINT "TransferRequestLine_transferRequestId_fkey" FOREIGN KEY ("transferRequestId") REFERENCES public."TransferRequest"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TransferRequest TransferRequest_acknowledgedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransferRequest"
    ADD CONSTRAINT "TransferRequest_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: TransferRequest TransferRequest_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransferRequest"
    ADD CONSTRAINT "TransferRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TransferRequest TransferRequest_finalizedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransferRequest"
    ADD CONSTRAINT "TransferRequest_finalizedByUserId_fkey" FOREIGN KEY ("finalizedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: TransferRequest TransferRequest_technicianId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransferRequest"
    ADD CONSTRAINT "TransferRequest_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES public."Technician"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: User User_technicianId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES public."Technician"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict gEmEaz5fp0W6p8xdXDnKzMGjbdFJBr2naubzscwn4KnWAPhfOj4EgPXRUrkRc7v

