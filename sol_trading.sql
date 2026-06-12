-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: sol_trading
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `account`
--

DROP TABLE IF EXISTS `account`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `account` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `balance` decimal(20,4) NOT NULL DEFAULT 847.5200,
  `balance_prev` decimal(20,4) NOT NULL DEFAULT 847.5200,
  `daily_profit` decimal(20,4) NOT NULL DEFAULT 0.0000,
  `daily_pct` decimal(10,2) NOT NULL DEFAULT 0.00,
  `last_date` varchar(20) NOT NULL DEFAULT '',
  `bot_funds` decimal(20,4) NOT NULL DEFAULT 0.0000,
  `user_id` int(11) NOT NULL DEFAULT 1,
  `bot_active` tinyint(1) NOT NULL DEFAULT 0,
  `last_tick` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `account`
--

LOCK TABLES `account` WRITE;
/*!40000 ALTER TABLE `account` DISABLE KEYS */;
INSERT INTO `account` VALUES (1,0.1000,0.0000,0.0975,13.88,'11/06/2026',0.6027,1,1,1781148180),(2,0.0000,0.0000,0.0000,0.00,'',0.0000,3,0,0),(3,0.0000,0.0000,0.0000,0.00,'',0.0000,4,0,0);
/*!40000 ALTER TABLE `account` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `login_attempts`
--

DROP TABLE IF EXISTS `login_attempts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `login_attempts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ip` varchar(45) NOT NULL,
  `attempted_at` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_ip` (`ip`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `login_attempts`
--

LOCK TABLES `login_attempts` WRITE;
/*!40000 ALTER TABLE `login_attempts` DISABLE KEYS */;
/*!40000 ALTER TABLE `login_attempts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `operations`
--

DROP TABLE IF EXISTS `operations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `operations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `trader` varchar(50) NOT NULL,
  `type` varchar(10) NOT NULL,
  `pair` varchar(30) NOT NULL,
  `profit` decimal(20,4) NOT NULL,
  `created_at` varchar(20) NOT NULL DEFAULT '',
  `user_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=259 DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `operations`
--

LOCK TABLES `operations` WRITE;
/*!40000 ALTER TABLE `operations` DISABLE KEYS */;
INSERT INTO `operations` VALUES (201,'trader25O','Buy','SOL/GIGA',-0.1749,'03:10:25',1),(202,'trader16Z','Buy','SOL/MEW',-0.1152,'03:10:33',1),(203,'trader5E','Buy','SOL/PONKE',-0.0904,'03:10:41',1),(204,'trader5E','Sell','SOL/PONKE',-0.0029,'03:10:49',1),(205,'trader16Z','Sell','SOL/MEW',0.0070,'03:10:57',1),(206,'trader25O','Sell','SOL/GIGA',-0.0091,'03:11:05',1),(207,'trader9K','Buy','MYRO/SOL',-0.1476,'03:11:13',1),(208,'trader19X','Buy','BOME/SOL',-0.0519,'03:11:21',1),(209,'trader19X','Sell','BOME/SOL',0.0103,'03:11:29',1),(210,'trader9K','Sell','MYRO/SOL',0.0118,'03:11:37',1),(211,'trader1A','Buy','SAMO/SOL',-0.1615,'03:11:45',1),(212,'trader1A','Sell','SAMO/SOL',-0.0124,'03:11:53',1),(213,'block_zero','Buy','SLERF/SOL',-0.1426,'03:18:26',1),(214,'block_zero','Sell','SLERF/SOL',0.0172,'03:18:34',1),(215,'quiet_scalp','Buy','SAMO/SOL',-0.0834,'03:18:42',1),(216,'arb_engine','Buy','SOL/MEW',-0.1676,'03:18:50',1),(217,'trader7G','Buy','SOL/GIGA',-0.0335,'03:45:53',1),(218,'arb_engine','Sell','SOL/MEW',0.0097,'03:46:01',1),(219,'sol_monk','Buy','BONK/SOL',-0.0824,'03:46:09',1),(220,'trader7G','Sell','SOL/GIGA',0.0011,'03:46:17',1),(221,'quiet_scalp','Sell','SAMO/SOL',0.0008,'03:46:25',1),(222,'sol_monk','Sell','BONK/SOL',-0.0029,'04:47:00',1),(223,'trader9K','Buy','MYRO/SOL',-0.0886,'04:48:00',1),(224,'perp_hunter','Buy','BOME/SOL',-0.0907,'04:49:00',1),(225,'perp_hunter','Sell','BOME/SOL',0.0010,'04:50:00',1),(226,'trader21L','Buy','SOL/PONKE',-0.0607,'04:51:00',1),(227,'flash_arb','Buy','SLERF/SOL',-0.0681,'04:52:00',1),(228,'flash_arb','Sell','SLERF/SOL',0.0002,'04:53:00',1),(229,'raydium_pro','Buy','SOL/PONKE',-0.0957,'04:54:00',1),(230,'trader19X','Buy','SOL/MEW',-0.0547,'04:55:00',1),(231,'trader9K','Sell','MYRO/SOL',-0.0036,'04:56:00',1),(232,'trader21L','Sell','SOL/PONKE',0.0044,'04:57:00',1),(233,'sol_whale_k','Buy','SOL/PONKE',-0.0526,'04:58:00',1),(234,'trader19X','Sell','SOL/MEW',0.0014,'04:59:00',1),(235,'raydium_pro','Sell','SOL/PONKE',-0.0063,'05:00:00',1),(236,'block_zero','Buy','WIF/SOL',-0.0975,'05:01:00',1),(237,'trader14P','Buy','SOL/POPCAT',-0.0386,'05:02:00',1),(238,'block_zero','Sell','WIF/SOL',-0.0013,'05:03:00',1),(239,'trader19X','Buy','SOL/GIGA',-0.0969,'05:04:00',1),(240,'trader14P','Sell','SOL/POPCAT',0.0042,'05:05:00',1),(241,'trader19X','Buy','MYRO/SOL',-0.0505,'05:06:00',1),(242,'sol_whale_k','Sell','SOL/PONKE',0.0080,'05:07:00',1),(243,'trader19X','Sell','SOL/GIGA',0.0112,'05:08:00',1),(244,'trader9K','Buy','SOL/GIGA',-0.1155,'05:09:00',1),(245,'onchain_rex','Buy','SOL/GIGA',-0.0546,'05:10:00',1),(246,'block_zero','Buy','BOME/SOL',-0.0216,'05:11:00',1),(247,'quiet_scalp','Buy','SOL/GIGA',-0.0321,'05:12:00',1),(248,'trader9K','Sell','SOL/GIGA',0.0187,'05:13:00',1),(249,'sol_samurai','Buy','WIF/SOL',-0.0525,'05:14:00',1),(250,'trader19X','Sell','MYRO/SOL',0.0062,'05:15:00',1),(251,'onchain_rex','Sell','SOL/GIGA',0.0023,'05:16:00',1),(252,'onchain_rex','Buy','SOL/GIGA',-0.0712,'05:17:00',1),(253,'block_zero','Sell','BOME/SOL',0.0004,'05:18:00',1),(254,'trader7G','Buy','SLERF/SOL',-0.0602,'05:19:00',1),(255,'onchain_rex','Sell','SOL/GIGA',0.0105,'05:20:00',1),(256,'quiet_scalp','Sell','SOL/GIGA',0.0015,'05:21:00',1),(257,'trader19X','Buy','SLERF/SOL',-0.0346,'05:22:00',1),(258,'sol_samurai','Sell','WIF/SOL',0.0081,'05:23:00',1);
/*!40000 ALTER TABLE `operations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pending_deposits`
--

DROP TABLE IF EXISTS `pending_deposits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pending_deposits` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `amount` decimal(20,4) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `created_at` int(11) NOT NULL DEFAULT 0,
  `user_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pending_deposits`
--

LOCK TABLES `pending_deposits` WRITE;
/*!40000 ALTER TABLE `pending_deposits` DISABLE KEYS */;
INSERT INTO `pending_deposits` VALUES (4,2.0000,'pending',1781144887,1);
/*!40000 ALTER TABLE `pending_deposits` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `positions`
--

DROP TABLE IF EXISTS `positions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `positions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pair` varchar(30) NOT NULL,
  `trader` varchar(50) NOT NULL,
  `amount` decimal(20,4) NOT NULL,
  `opened_at` varchar(20) NOT NULL DEFAULT '',
  `user_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `positions`
--

LOCK TABLES `positions` WRITE;
/*!40000 ALTER TABLE `positions` DISABLE KEYS */;
INSERT INTO `positions` VALUES (29,'SLERF/SOL','trader7G',0.0602,'05:19:00',1),(30,'SLERF/SOL','trader19X',0.0346,'05:22:00',1);
/*!40000 ALTER TABLE `positions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `traders`
--

DROP TABLE IF EXISTS `traders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `traders` (
  `id` int(11) NOT NULL,
  `name` varchar(50) NOT NULL,
  `weekly_profit` decimal(10,1) NOT NULL DEFAULT 0.0,
  `drawdown` decimal(10,1) NOT NULL DEFAULT 0.0,
  `score` int(11) NOT NULL DEFAULT 50,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `traders`
--

LOCK TABLES `traders` WRITE;
/*!40000 ALTER TABLE `traders` DISABLE KEYS */;
INSERT INTO `traders` VALUES (1,'trader1A',15.4,8.2,87),(2,'trader2F',22.1,12.5,92),(3,'trader3C',7.8,5.1,65),(4,'trader4B',18.9,25.3,45),(5,'trader5E',11.2,9.8,78),(6,'trader6D',5.3,7.2,58),(7,'trader7G',19.7,11.0,89),(8,'trader8H',31.5,28.7,38),(9,'trader9K',13.1,6.4,81),(10,'trader10M',4.2,9.1,52),(11,'trader11R',26.8,14.3,94),(12,'trader12T',8.5,4.7,63),(13,'trader13N',17.3,22.1,41),(14,'trader14P',12.9,8.8,76),(15,'trader15W',3.1,11.5,47),(16,'trader16Z',20.4,7.9,91),(17,'trader17Q',14.7,16.2,69),(18,'trader18J',6.9,5.5,60),(19,'trader19X',24.3,10.1,88),(20,'trader20V',2.4,18.9,34),(21,'trader21L',11.8,7.3,74),(22,'trader22S',29.1,31.4,29),(23,'trader23Y',16.6,9.4,83),(24,'trader24U',9.2,6.8,61),(25,'trader25O',21.5,13.7,86),(26,'trader26I',1.8,8.3,44),(27,'trader27E',18.2,24.6,42),(28,'trader28A',10.5,5.9,72),(29,'trader29B',33.7,27.8,36),(30,'trader30C',13.9,8.1,80),(31,'sol_whale_k',28.4,9.2,93),(32,'alpha_mev',19.6,11.8,85),(33,'degen_chad',4.1,22.3,37),(34,'moonshot_rex',35.2,18.5,79),(35,'quiet_scalp',12.7,5.3,88),(36,'jito_sniper',23.9,13.1,82),(37,'dark_pool_x',8.3,6.7,64),(38,'perp_hunter',17.1,10.4,84),(39,'orca_knife',31.0,26.9,41),(40,'sol_samurai',14.5,7.8,87),(41,'drift_lord',6.2,19.4,43),(42,'raydium_pro',22.8,12.0,90),(43,'block_zero',10.9,8.5,75),(44,'laminar_k',26.3,15.7,77),(45,'pumpbot9k',2.9,24.1,28),(46,'arb_engine',18.7,6.1,92),(47,'sol_monk',11.4,4.9,83),(48,'mango_max',7.5,21.6,39),(49,'tensor_t',24.6,9.7,89),(50,'hedge_zero',16.2,7.3,86),(51,'flash_arb',21.3,8.6,91),(52,'onchain_rex',15.8,7.1,85),(53,'sol_viper',27.5,12.4,88),(54,'delta_grid',13.2,5.8,82);
/*!40000 ALTER TABLE `traders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transactions`
--

DROP TABLE IF EXISTS `transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `transactions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` varchar(20) NOT NULL,
  `amount` decimal(20,4) NOT NULL,
  `created_at` varchar(30) NOT NULL DEFAULT '',
  `user_id` int(11) NOT NULL DEFAULT 1,
  `wallet_address` varchar(64) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transactions`
--

LOCK TABLES `transactions` WRITE;
/*!40000 ALTER TABLE `transactions` DISABLE KEYS */;
INSERT INTO `transactions` VALUES (13,'Admin: Depósito',1.0000,'11/06/2026 04:10:11',1,''),(14,'Alocação para Bot',1.0000,'11/06/2026 04:10:21',1,''),(15,'Retirada do Bot',0.3000,'11/06/2026 04:19:13',1,''),(16,'Levantamento',0.3000,'11/06/2026 04:19:21',1,''),(17,'Retirada do Bot',0.1000,'11/06/2026 04:24:59',1,'');
/*!40000 ALTER TABLE `transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `used_signatures`
--

DROP TABLE IF EXISTS `used_signatures`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `used_signatures` (
  `sig` varchar(128) NOT NULL,
  `created_at` varchar(30) NOT NULL DEFAULT '',
  PRIMARY KEY (`sig`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `used_signatures`
--

LOCK TABLES `used_signatures` WRITE;
/*!40000 ALTER TABLE `used_signatures` DISABLE KEYS */;
/*!40000 ALTER TABLE `used_signatures` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `is_admin` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'KX3T','manellopes1973@gmail.com','$2y$10$SXSv7t8ax0RB2Az0S6/WY.H3BzUOuBFVbKeHXRLerFnmZkoBC9TO2','2026-06-11 02:49:56',1),(2,'testuser','test@test.com','$2y$10$fsmK17KhpGA1Hq8L9fGAcONO8zpVc3GV77tqUXr5Ek6EhAhFYUTi2','2026-06-11 02:53:13',0),(3,'testuser2','test2@test.com','$2y$10$EfZBGTqld/Cb02KOKE9.UOOO5gFjT08yijZ.yiCyu6iOuwb5NUiey','2026-06-11 02:54:03',0),(4,'11s','ddd@gmail.com','$2y$10$6nSY5htBDJ7iEFCzvap8WeprEMmZ2zqXqHpLupYNnPey0y9sJmdfq','2026-06-11 02:55:39',0);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-11  4:23:33
