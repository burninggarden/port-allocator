import FS            from 'fs';
import Tap           from 'tap';
import Config        from '@burninggarden/config';
import PortAllocator from 'port-allocator';

Tap.test('.createPortAllocation()', suite => {
	suite.test('returns a port allocation with an available TCP port and HTTP port', test => {
		const portAllocation = (new PortAllocator()).createPortAllocation();

		test.ok(typeof portAllocation.httpPort === 'number');
		test.ok(typeof portAllocation.tcpPort === 'number');
		test.end();
	});

	suite.test('returns different port allocations with each subsequent call', test => {
		const portAllocationOne = (new PortAllocator()).createPortAllocation();
		const portAllocationTwo = (new PortAllocator()).createPortAllocation();

		const uniquePorts = [];

		const allPorts = [
			portAllocationOne.httpPort,
			portAllocationOne.tcpPort,
			portAllocationTwo.httpPort,
			portAllocationTwo.tcpPort
		];

		allPorts.forEach(port => {
			if (!uniquePorts.includes(port)) {
				uniquePorts.push(port);
			}
		});

		test.deepEqual(uniquePorts, allPorts);
		test.end();
	});

	suite.test('bypasses designated manager port', test => {
		const managerPort = Config.getManagerPort();
		const filepath = '/tmp/bg-locks/port';

		// Explicitly overwrite the port lockfile so that we start
		// iterating through available ports pretty close to the port
		// we're trying to examine:
		FS.writeFileSync(filepath, managerPort - 100, 'utf8');

		const portAllocator = new PortAllocator();

		let allocation = portAllocator.createPortAllocation();

		while (true) {
			if (allocation.httpPort === managerPort) {
				test.notOk('Assigned manager port for http port');
				break;
			}

			if (allocation.tcpPort === managerPort) {
				test.notOk('Assigned manager port for tcp port');
				break;
			}

			if (allocation.httpPort > managerPort) {
				break;
			}

			allocation = portAllocator.createPortAllocation();
		}

		test.end();
	});

	suite.test('bypasses designated https port', test => {
		const httpsPort = Config.getHttpsPort();
		const filepath = '/tmp/bg-locks/port';

		// Explicitly overwrite the port lockfile so that we start
		// iterating through available ports pretty close to the port
		// we're trying to examine:
		FS.writeFileSync(filepath, httpsPort - 100, 'utf8');

		const portAllocator = new PortAllocator();

		let allocation = portAllocator.createPortAllocation();

		while (true) {
			if (allocation.httpPort === httpsPort) {
				test.notOk('Assigned https port for http port');
				break;
			}

			if (allocation.tcpPort === httpsPort) {
				test.notOk('Assigned https port for tcp port');
				break;
			}

			if (allocation.httpPort > httpsPort) {
				break;
			}

			allocation = portAllocator.createPortAllocation();
		}

		test.end();
	});

	suite.end();
});
