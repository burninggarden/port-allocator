import Tap           from 'tap';
import PortAllocator from 'port-allocator';

Tap.test('.createPortAllocation()', suite => {
	suite.test('returns a port allocation with an available TCP port and HTTP port', test => {
		const portAllocation = (new PortAllocator()).createPortAllocation();

		test.ok(typeof portAllocation.getHttpPort() === 'number');
		test.ok(typeof portAllocation.getTcpPort() === 'number');
		test.end();
	});

	suite.test('returns different port allocations with each subsequent call', test => {
		const portAllocationOne = (new PortAllocator()).createPortAllocation();
		const portAllocationTwo = (new PortAllocator()).createPortAllocation();

		const uniquePorts = [];

		const allPorts = [
			portAllocationOne.getHttpPort(),
			portAllocationOne.getTcpPort(),
			portAllocationTwo.getHttpPort(),
			portAllocationTwo.getTcpPort()
		];

		allPorts.forEach(port => {
			if (!uniquePorts.includes(port)) {
				uniquePorts.push(port);
			}
		});

		test.deepEqual(uniquePorts, allPorts);
		test.end();
	});

	suite.end();
});
