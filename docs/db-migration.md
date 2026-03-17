# DB Migration: live (3306) → local Docker (3307)

This document contains safe, copy-paste commands to complete the migration of a live MySQL database (host:3306) into the test Docker MySQL instance running on host port 3307. Run these commands locally on your machine — the agent environment cannot access your Docker runtime or your live DB credentials.

Warning: these commands touch production data. Ensure you have backups and run during a maintenance window.

1) Identify the MySQL container (replace if you used a custom image/name):

```powershell
# lists running containers and their ports
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
```

2) (Optional) If your Docker MySQL has a root password, note it. If you started MySQL with `-e MYSQL_ROOT_PASSWORD=...`, use that here.

3) Ensure the target user exists and has a known password. Replace `<container>`, `<rootpw>`, `<db_user>` and `<db_password>` before running.

```powershell
# Windows / PowerShell
$container = "<container>"
$rootpw = "<rootpw>"
$dbUser = "kf8fvd"
$dbPass = "secetpass"   # or whatever you want the target password to be

docker exec -i $container mysql -uroot -p$rootpw -e "CREATE USER IF NOT EXISTS '$dbUser'@'%' IDENTIFIED BY '$dbPass'; GRANT ALL PRIVILEGES ON *.* TO '$dbUser'@'%'; FLUSH PRIVILEGES;"
```

Or a one-liner (POSIX shell):

```sh
docker exec -i <container> mysql -uroot -p<rootpw> -e "CREATE USER IF NOT EXISTS 'kf8fvd'@'%' IDENTIFIED BY 'secetpass'; GRANT ALL PRIVILEGES ON *.* TO 'kf8fvd'@'%'; FLUSH PRIVILEGES;"
```

4) Use `mysqldump` to copy the live DB and import into the container. Two common approaches:

A) If you have `mysqldump` installed locally:

```powershell
# PowerShell example: dump from source and import into container
mysqldump -h 127.0.0.1 -P 3306 -u <src_user> -p"<src_pass>" <src_db> | docker exec -i <container> mysql -u<dst_user> -p"<dst_pass>" <dst_db>
```

B) If you don't have `mysqldump` locally, use a temporary mysql client container:

```powershell
docker run --rm --network host mysql:8.0 sh -c "exec mysqldump -h 127.0.0.1 -P 3306 -u<src_user> -p'<src_pass>' <src_db>" | docker exec -i <container> mysql -u<dst_user> -p"<dst_pass>" <dst_db>
```

Note: On Windows `--network host` is not supported in the same way; you may use container networking or run the dump from a machine with access to the source DB.

5) Verify the import:

```powershell
# connect to container and run a quick count
docker exec -it <container> mysql -u<dst_user> -p"<dst_pass>" -e "SELECT COUNT(*) FROM some_table LIMIT 1;" <dst_db>
```

6) If the agent's Node helper scripts are preferred, run locally (they exist at `scripts/copy_mysql_db.js` and `scripts/set_mysql_user_password.js`). Example:

```powershell
# run with node
node scripts/set_mysql_user_password.js --container <container> --rootpw <rootpw> --user kf8fvd --password secetpass
node scripts/copy_mysql_db.js --srcHost 127.0.0.1 --srcPort 3306 --srcUser <src_user> --srcPass <src_pass> --srcDb <src_db> --dstHost 127.0.0.1 --dstPort 3307 --dstUser kf8fvd --dstPass secetpass --dstDb kf8fvd
```

Tips:
- If the target MySQL container binds to `127.0.0.1:3307` on the host, use `127.0.0.1`/`3307` as the destination host/port in your import commands.
- If you prefer a safer approach, create the target DB first, then import only non-destructive tables, or import to a new schema and switch over after validation.

If you want, paste the `docker ps` output here and I can give the exact command to run locally.
