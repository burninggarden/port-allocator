
import FS             from 'fs';
import Mutex          from '@burninggarden/mutex';
import Config         from '@burninggarden/config';
import {Directory}    from '@burninggarden/filesystem';
import {TimeInterval} from '@burninggarden/enums';
import ChildProcess   from 'child_process';
import PortAllocation from 'interfaces/port-allocation';

// Technically we can bind to ports lower than this without being root,
// // but there's a lot of noise to compete with between 1024 and 2000.
const MIN_PORT = 2000;

// The max available port number on linux (2^16 - 1):
const MAX_PORT = 65535;



class PortAllocator {

	private usedPortCache   : number[]     | null = null;
	private cacheClearTimer : NodeJS.Timer | null = null;

	public createPortAllocation(): PortAllocation {
		const httpPort = this.getNextFreePort();
		const tcpPort  = this.getNextFreePort();

		return {
			httpPort,
			tcpPort
		};
	}

	private getNextFreePort(): number {
		var mutex = new Mutex('port');

		// Acquire a blocking mutex for port allocation.
		// This prevents multiple processes from reading/incrementing/writing
		// the port lockfile at the same time. It's gross though, because it
		// works by blocking the event loop until we can claim the file.
		// Changing this behavior to async would require a lot of unravelling of
		// process bootstrap code...
		mutex.acquireSync();

		let startingPort = MIN_PORT;

		const directoryPath = '/tmp/bg-locks';

		Directory.fromPath(directoryPath).ensureExists();

		const filepath = `${directoryPath}/port`;

		if (FS.existsSync(filepath)) {
			startingPort = parseInt(FS.readFileSync(filepath, 'utf8'));
		}

		if (isNaN(startingPort)) {
			throw new Error(`
				Invalid starting port: ${startingPort}
			`);
		}

		const usedPorts = this.getUsedPorts();

		let currentPort = this.incrementPort(startingPort);
		let looped      = false;

		while (true) {
			// If we've surpassed the maximum allowed port...
			if (currentPort > MAX_PORT) {
				// ... and we haven't yet hit the earlier ranges
				// (ie, startingPort was originally assigned to something
				// higher than MIN_PORT) ...
				if (!looped) {
					// ... then we should roll back over to the minimum port:
					looped = true;
					currentPort = MIN_PORT;
				} else {
					// Otherwise throw an exception.
					throw new Error(`
						No free ports available within allowed block:
						${MIN_PORT} - ${MAX_PORT}
					`);
				}
			}

			// If this port is determined to be free, exit the loop.
			if (!usedPorts.includes(currentPort)) {
				break;
			}

			// Otherwise, proceed to checking the next allocatable port number:
			currentPort = this.incrementPort(currentPort);
		}

		FS.writeFileSync(filepath, currentPort, 'utf8');
		FS.chownSync(filepath, Config.getUid(), Config.getGid());

		// We're now safe to release the mutex. This enables other processes
		// to safely allocate ports again.
		mutex.releaseSync();

		return currentPort;
	}

	private getUsedPorts(): number[] {
		if (this.hasUsedPortCache()) {
			return this.getUsedPortCache();
		}

		const output = ChildProcess.execSync('netstat -lntu').toString('utf8');
		const lines  = output.split('\n');

		// We can ignore the first line; it's just a comment in the form of:
		// "Active Internet connections (only servers)"
		lines.shift();

		// We want to use the specified headers to determine the positions
		// within each line where we need to slice out the local address.
		// This "headers" line is in the form:
		// "Proto   Recv-Q   Send-Q   Local Address   Foreign Address   State"
		const headers = lines.shift();

		// We're interested in the local address, so determine the start and
		// end offsets of that particular header.
		const
			startOffset = headers.indexOf('Local Address'),
			endOffset   = headers.indexOf('Foreign Address');

		// A result array to store the used ports that we encounter on each
		// line:
		let usedPorts = [ ];

		lines.forEach(line => {
			// Each line will correspond to a local network mapping in the form:
			// "tcp   0   0   0.0.0.0:1234   0.0.0.0:*   LISTEN"
			const
				address    = line.slice(startOffset, endOffset),
				colonIndex = address.lastIndexOf(':');

			// We're interested in the numeric portion following the last colon:
			// (ie, the local port):
			const portString = address.slice(colonIndex + 1);
			const port = parseInt(portString);

			// It's unlikely that a port would ever be specified as something
			// non-numeric, but just in case that happens, we should ignore it:
			if (isNaN(port)) {
				return;
			}

			usedPorts.push(port);
		});

		// Sort the ports from smallest to largest:
		usedPorts = usedPorts.sort((a, b) => {
			return a < b ? -1 : 1;
		});

		// We need to also block off the dedicated port for the Manager process.
		// (It uses a fixed port so that the botanist tool doesn't have to hit
		// the database in order to determine how to communicate with it.)
		usedPorts.push(Config.getManagerPort());

		this.setUsedPortCache(usedPorts);
		this.queueClearUsedPortCache();

		return usedPorts;
	}

	private hasUsedPortCache(): boolean {
		return this.usedPortCache !== null;
	}

	private getUsedPortCache(): number[] {
		if (this.usedPortCache === null) {
			throw new Error(
				'Tried to access used port cache, but it did not exist'
			);
		}

		return this.usedPortCache;
	}

	private setUsedPortCache(cache: number[] | null): this {
		this.usedPortCache = cache;
		return this;
	}

	private queueClearUsedPortCache(): void {
		clearTimeout(this.getCacheClearTimer());

		const timer = setTimeout(
			this.clearUsedPortCache.bind(this),
			this.getCacheClearDelay()
		);

		this.setCacheClearTimer(timer);
	}

	private getCacheClearTimer(): NodeJS.Timer | null {
		return this.cacheClearTimer;
	}

	private setCacheClearTimer(timer: NodeJS.Timer): this {
		this.cacheClearTimer = timer;
		return this;
	}

	private getCacheClearDelay(): number {
		return TimeInterval.ONE_SECOND;
	}

	private clearUsedPortCache(): void {
		this.setUsedPortCache(null);
	}

	private isRestrictedPort(port: number): boolean {
		switch (port) {
			case Config.getManagerPort():
				return true;

			case Config.getHttpsPort():
				return true;

			default:
				return false;
		}
	}

	private incrementPort(port: number): number {
		port++;

		while (this.isRestrictedPort(port)) {
			port++;
		}

		return port;
	}

}

export default PortAllocator;
