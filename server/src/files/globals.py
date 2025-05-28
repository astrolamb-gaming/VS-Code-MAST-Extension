class Set:
	def __init__(arg0: any)->Set:
		"""
		Defines a Set object. A set is a collection of items which are unordered, unchangeable, and unindexed, but you can add or remove items.  
		A set cannot contain duplicate values.  
		Usage:  
		mySet = Set((item1, item2, item3)) #Note the double parentheses!  
		OR:
		mySet = {item1, item2, item3}
		"""
		pass
	def add(element: any):
		""" Add an item to a Set.  
		Args:
			element (any): the item to add to the set.

		Example:  
			fruits = {"apple", "banana", "cherry"}
			fruits.add("orange")
			# Result: {"apple", "banana", "cherry", "orange"}
		"""
		pass
	def clear():
		"""
		Remove all the elements from the Set

		Example:
			mySet = {"one","two"}
			mySet.clear()
			print(mySet) # returns {}
		"""
		pass
	def copy()->Set:
		"""
		Returns a copy of the Set.

		Returns:
			A copy of the Set.

		Example:
			mySet = {"one", "two"}
			yourSet = mySet.copy()
			print(yourSet) # Returns {"one", "two"}
		"""
		pass
	def difference(set1: Set, set2: Set)->Set:
		"""
		Returns a Set containing the difference between two or more sets.

		Args:
			set1: Required. The set(s) to check for differences in.
			set2: Optional. The other set to search for equal terms in. You can compare as many sets you like. Separate the sets with a comma.
		
		Returns:
			A set with the differences in the supplied sets.

		Example:
			mySet = {"one", "two", "three"}
			subSet = {"one", "two"}
			newSet = mySet.difference(subSet)
			print(newSet) # Returns {"three"}
		"""
		pass
	def difference_update(set1: Set, Set2: Set):
		"""
		Remove the items that exist in both sets

		Args:
			set1: Requried. The set to check for differences in.
			set2: Optional. The other set to search for equal items in. You can compare as many sets as you like. Separate the sets with a comma.

		Example:
			mySet = {"one", "two", "three"}
			otherSet = {"one", "two"}
			mySet.difference_update(otherSet)
			print(mySet) # Returns {"three"}
		"""
		pass
	def discard(value: any):
		"""
		Remove the specified item from the Set. Does not throw an error if the value is not in the Set.

		Args:
			value: The value to remove from the Set.

		Example:
			fruits = {"apple", "banana", "cherry"}
			fruits.discard("banana")
			print(fruits) # Returns {"apple", "cherry"}
		"""
		pass
